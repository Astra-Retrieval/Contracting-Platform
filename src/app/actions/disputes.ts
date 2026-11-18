"use server";

import { requireAdmin, requireCustomer, requirePro, requireViewer } from "@/lib/auth";
import { displayName, notify, notifyAdmin, projectTitle } from "@/lib/email";
import { flash, money, text, toCents } from "@/lib/format";
import { announceSettlement, settleMilestone } from "@/lib/payments";
import { isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

// Dispute flow
//   1. Customer reports a problem on a paid milestone. The money is frozen ("disputed").
//   2. The pro replies and can offer a partial or full refund.
//   3. It ends one of four ways:
//        - the customer accepts the pro's offer            (refund + release the rest)
//        - the customer releases the payment in full
//        - the customer withdraws the dispute              (back to where it was)
//        - either side asks the platform to decide, and an admin sets the refund

type Admin = ReturnType<typeof createAdminClient>;
const OPEN = ["open", "escalated"];

async function loadDispute(admin: Admin, id: string) {
  const { data } = await admin.from("disputes").select("*").eq("id", id).maybeSingle();
  return data;
}

async function jobPath(admin: Admin, projectId: string, proId: string) {
  const { data } = await admin
    .from("quote_requests")
    .select("id")
    .eq("project_id", projectId)
    .eq("pro_id", proId)
    .maybeSingle();
  return data ? `/pro/jobs/${data.id}` : "/pro/jobs";
}

/** Customer reports a problem with a paid milestone. */
export async function openDispute(formData: FormData) {
  const viewer = await requireCustomer();
  const admin = createAdminClient();
  const milestoneId = text(formData.get("milestone_id"));
  const reason = text(formData.get("reason"));

  const { data: milestone } = await admin
    .from("milestones")
    .select("id, quote_id, project_id, title, amount_cents, status")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) flash("/projects", "error", "Milestone not found.");
  const back = `/projects/${milestone.project_id}`;
  const { data: project } = await admin
    .from("projects")
    .select("customer_id, title")
    .eq("id", milestone.project_id)
    .maybeSingle();
  if (project?.customer_id !== viewer.id) flash("/projects", "error", "Milestone not found.");
  if (reason.length < 10) flash(back, "error", "Describe the problem in a sentence or two.");
  if (!["funded", "submitted"].includes(milestone.status)) {
    flash(back, "error", "Only a paid milestone that has not been released can be disputed.");
  }
  const { data: quote } = await admin.from("quotes").select("pro_id").eq("id", milestone.quote_id).single();
  if (!quote) flash(back, "error", "Quote not found.");

  // Freeze the milestone first; only one request can win this update.
  const { data: frozen } = await admin
    .from("milestones")
    .update({ status: "disputed", status_before_dispute: milestone.status })
    .eq("id", milestoneId)
    .in("status", ["funded", "submitted"])
    .select("id")
    .maybeSingle();
  if (!frozen) flash(back, "error", "This milestone can no longer be disputed.");

  const { error } = await admin.from("disputes").insert({
    milestone_id: milestoneId,
    project_id: milestone.project_id,
    customer_id: viewer.id,
    pro_id: quote.pro_id,
    reason,
  });
  if (error) {
    await admin.from("milestones").update({ status: milestone.status }).eq("id", milestoneId);
    flash(back, "error", error.message);
  }

  const mail = {
    subject: `Problem reported: ${milestone.title}`,
    lines: [
      `${viewer.fullName || "The customer"} reported a problem with "${milestone.title}" (${money(milestone.amount_cents)}) on "${project.title}":`,
      reason,
      "The payment is on hold until this is resolved.",
    ],
  };
  await notify(quote.pro_id, {
    ...mail,
    lines: [...mail.lines, "Reply with your side, and offer a refund if that is fair."],
    path: await jobPath(admin, milestone.project_id, quote.pro_id),
    cta: "Respond",
  });
  await notifyAdmin({ ...mail, path: "/admin/disputes", cta: "Open disputes" });
  flash(back, "notice", "Problem reported. The payment is on hold and the pro has been told.");
}

/** Pro replies to a dispute and can offer a refund. */
export async function respondToDispute(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const dispute = await loadDispute(admin, text(formData.get("dispute_id")));
  if (!dispute || dispute.pro_id !== viewer.id) flash("/pro/jobs", "error", "Dispute not found.");
  const back = await jobPath(admin, dispute.project_id, viewer.id);
  if (!OPEN.includes(dispute.status)) flash(back, "error", "This dispute is already closed.");

  const response = text(formData.get("response"));
  if (response.length < 10) flash(back, "error", "Write a short reply to the customer.");
  const { data: milestone } = await admin
    .from("milestones")
    .select("title, amount_cents")
    .eq("id", dispute.milestone_id)
    .single();
  const offerRaw = text(formData.get("proposed_refund"));
  const offer = offerRaw ? toCents(offerRaw) : null;
  if (offer !== null && offer > Number(milestone?.amount_cents ?? 0)) {
    flash(back, "error", "The refund offer cannot be more than the milestone amount.");
  }

  await admin
    .from("disputes")
    .update({ pro_response: response, proposed_refund_cents: offer })
    .eq("id", dispute.id);

  await notify(dispute.customer_id, {
    subject: `${await displayName(viewer.id)} replied to your dispute`,
    lines: [
      `${await displayName(viewer.id)} replied about "${milestone?.title}":`,
      response,
      offer !== null
        ? `They are offering a refund of ${money(offer)}. Accepting it refunds you that amount and releases the rest.`
        : "They did not offer a refund. You can release the payment, withdraw the dispute, or ask the platform to decide.",
    ],
    path: `/projects/${dispute.project_id}`,
    cta: "Review the reply",
  });
  flash(back, "notice", "Your reply was sent to the customer.");
}

/** Customer ends the dispute themselves: accept the pro's offer, release in full, or withdraw. */
export async function resolveDisputeAsCustomer(formData: FormData) {
  const viewer = await requireCustomer();
  const admin = createAdminClient();
  const dispute = await loadDispute(admin, text(formData.get("dispute_id")));
  if (!dispute || dispute.customer_id !== viewer.id) flash("/projects", "error", "Dispute not found.");
  const back = `/projects/${dispute.project_id}`;
  if (!OPEN.includes(dispute.status)) flash(back, "error", "This dispute is already closed.");
  const mode = text(formData.get("mode"));
  const proPath = await jobPath(admin, dispute.project_id, dispute.pro_id);

  if (mode === "withdraw") {
    const { data: milestone } = await admin
      .from("milestones")
      .select("status_before_dispute, title")
      .eq("id", dispute.milestone_id)
      .single();
    await admin
      .from("milestones")
      .update({ status: milestone?.status_before_dispute || "funded", status_before_dispute: null })
      .eq("id", dispute.milestone_id)
      .eq("status", "disputed");
    await admin
      .from("disputes")
      .update({ status: "withdrawn", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
      .eq("id", dispute.id);
    await notify(dispute.pro_id, {
      subject: `Dispute withdrawn: ${milestone?.title}`,
      lines: [`The customer withdrew their dispute on "${milestone?.title}". The milestone is back to normal.`],
      path: proPath,
      cta: "Open the job",
    });
    flash(back, "notice", "Dispute withdrawn. The milestone is back to where it was.");
  }

  let refund = 0;
  if (mode === "accept_offer") {
    if (dispute.proposed_refund_cents == null) flash(back, "error", "The pro has not made an offer yet.");
    refund = Number(dispute.proposed_refund_cents);
  } else if (mode !== "release") {
    flash(back, "error", "Unknown action.");
  }
  if (!isStripeConfigured) flash(back, "error", "Payments are not connected yet.");

  const result = await settleMilestone(dispute.milestone_id, { refundCents: refund, from: ["disputed"] });
  if (result.error) flash(back, "error", result.error);
  await admin
    .from("disputes")
    .update({
      status: "resolved",
      refund_cents: refund,
      resolution_note: mode === "accept_offer" ? "Customer accepted the pro's offer." : "Customer released the payment in full.",
      resolved_by: viewer.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", dispute.id);
  await announceSettlement(result, viewer.id);
  await notify(dispute.pro_id, {
    subject: `Dispute resolved: ${result.milestoneTitle}`,
    lines: [
      refund > 0
        ? `The customer accepted your offer. ${money(refund)} was refunded to them and the rest was released.`
        : "The customer released the payment in full.",
    ],
    path: proPath,
    cta: "Open the job",
  });
  flash(
    back,
    "notice",
    refund > 0 ? `Resolved. ${money(refund)} is being refunded to you.` : "Resolved. The payment has been released.",
  );
}

/** Either side asks the platform to step in and decide. */
export async function escalateDispute(formData: FormData) {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const dispute = await loadDispute(admin, text(formData.get("dispute_id")));
  if (!dispute || ![dispute.customer_id, dispute.pro_id].includes(viewer.id)) {
    flash("/dashboard", "error", "Dispute not found.");
  }
  const back =
    viewer.id === dispute.customer_id
      ? `/projects/${dispute.project_id}`
      : await jobPath(admin, dispute.project_id, dispute.pro_id);
  if (dispute.status !== "open") flash(back, "notice", "The platform has already been asked to decide.");

  await admin.from("disputes").update({ status: "escalated" }).eq("id", dispute.id);
  const title = await projectTitle(dispute.project_id);
  await notifyAdmin({
    subject: `Dispute needs a decision: ${title}`,
    lines: [`${await displayName(viewer.id)} asked the platform to decide a dispute on "${title}".`, `Customer's reason: ${dispute.reason}`],
    path: "/admin/disputes",
    cta: "Review the dispute",
  });
  const otherId = viewer.id === dispute.customer_id ? dispute.pro_id : dispute.customer_id;
  await notify(otherId, {
    subject: `The platform was asked to decide your dispute on ${title}`,
    lines: ["Our team will review what both sides wrote and decide how the payment is split. You will get an email with the outcome."],
    path: otherId === dispute.customer_id ? `/projects/${dispute.project_id}` : await jobPath(admin, dispute.project_id, dispute.pro_id),
  });
  flash(back, "notice", "Our team has been asked to review this. Both sides will be emailed the decision.");
}

/** Platform admin decides: how much goes back to the customer, the rest is released. */
export async function adminResolveDispute(formData: FormData) {
  const viewer = await requireAdmin();
  const admin = createAdminClient();
  const back = "/admin/disputes";
  const dispute = await loadDispute(admin, text(formData.get("dispute_id")));
  if (!dispute) flash(back, "error", "Dispute not found.");
  if (!OPEN.includes(dispute.status)) flash(back, "error", "This dispute is already closed.");

  const { data: milestone } = await admin
    .from("milestones")
    .select("amount_cents")
    .eq("id", dispute.milestone_id)
    .single();
  const amount = Number(milestone?.amount_cents ?? 0);
  const refund = toCents(formData.get("refund"));
  const note = text(formData.get("note"));
  if (refund < 0 || refund > amount) flash(back, "error", `The refund must be between $0 and ${money(amount)}.`);
  if (note.length < 10) flash(back, "error", "Add a short note explaining the decision. Both sides will see it.");
  if (!isStripeConfigured) flash(back, "error", "Payments are not connected yet.");

  const result = await settleMilestone(dispute.milestone_id, { refundCents: refund, from: ["disputed"] });
  if (result.error) flash(back, "error", result.error);
  await admin
    .from("disputes")
    .update({
      status: "resolved",
      refund_cents: refund,
      resolution_note: note,
      resolved_by: viewer.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", dispute.id);
  await announceSettlement(result, dispute.customer_id);

  const outcome = `Decision on "${result.milestoneTitle}": ${money(refund)} refunded to the customer, ${money(amount - refund)} released to the pro (before fees).`;
  await notify(dispute.customer_id, {
    subject: "Your dispute has been decided",
    lines: [outcome, `Note from our team: ${note}`],
    path: `/projects/${dispute.project_id}`,
    cta: "Open the project",
  });
  await notify(dispute.pro_id, {
    subject: "A dispute on your job has been decided",
    lines: [outcome, `Note from our team: ${note}`],
    path: await jobPath(admin, dispute.project_id, dispute.pro_id),
    cta: "Open the job",
  });
  flash(back, "notice", "Dispute resolved and both sides notified.");
}
