"use server";

import { requireAdmin, requireCustomer, requirePro, requireViewer } from "@/lib/auth";
import { displayName, notify, notifyAdmin, projectTitle } from "@/lib/email";
import { flash, money, text, toCents } from "@/lib/format";
import { announceRefund, closeDisputedMilestone } from "@/lib/payments";
import { isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

// Dispute flow
//   1. Customer reports a problem on a milestone they have paid ("disputed"). The pro
//      already has the money, so this is a request to put things right or refund.
//   2. The pro replies and can offer a partial or full refund.
//   3. It ends one of four ways:
//        - the customer accepts the pro's offer            (that amount is refunded)
//        - the customer closes it with no refund
//        - the customer withdraws the dispute
//        - either side asks the platform to decide, and an admin sets the refund
//      Refunds come out of the pro's Stripe balance.

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
  if (milestone.status !== "paid") {
    flash(back, "error", "You can report a problem on a milestone once you have paid it.");
  }
  const { data: quote } = await admin.from("quotes").select("pro_id").eq("id", milestone.quote_id).single();
  if (!quote) flash(back, "error", "Quote not found.");

  // Mark the milestone first; only one request can win this update.
  const { data: frozen } = await admin
    .from("milestones")
    .update({ status: "disputed", status_before_dispute: milestone.status })
    .eq("id", milestoneId)
    .eq("status", "paid")
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
    ],
  };
  await notify(quote.pro_id, {
    ...mail,
    lines: [...mail.lines, "Reply with your side, and offer to fix it or refund part of the payment if that is fair."],
    path: await jobPath(admin, milestone.project_id, quote.pro_id),
    cta: "Respond",
  });
  await notifyAdmin({ ...mail, path: "/admin/disputes", cta: "Open disputes" });
  flash(back, "notice", "Problem reported. The pro has been told and asked to respond.");
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
        ? `They are offering a refund of ${money(offer)}. Accepting it refunds you that amount and closes the dispute.`
        : "They did not offer a refund. You can close the dispute, or ask the platform to decide.",
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
      .update({ status: "paid", status_before_dispute: null })
      .eq("id", dispute.milestone_id)
      .eq("status", "disputed");
    await admin
      .from("disputes")
      .update({ status: "withdrawn", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
      .eq("id", dispute.id);
    await notify(dispute.pro_id, {
      subject: `Dispute withdrawn: ${milestone?.title}`,
      lines: [`The customer withdrew their dispute on "${milestone?.title}". Nothing is refunded.`],
      path: proPath,
      cta: "Open the job",
    });
    flash(back, "notice", "Dispute withdrawn.");
  }

  let refund = 0;
  if (mode === "accept_offer") {
    if (dispute.proposed_refund_cents == null) flash(back, "error", "The pro has not made an offer yet.");
    refund = Number(dispute.proposed_refund_cents);
  } else if (mode !== "release") {
    flash(back, "error", "Unknown action.");
  }
  if (!isStripeConfigured) flash(back, "error", "Payments are not connected yet.");

  const result = await closeDisputedMilestone(dispute.milestone_id, refund);
  if (result.error) flash(back, "error", result.error);
  await admin
    .from("disputes")
    .update({
      status: "resolved",
      refund_cents: refund,
      resolution_note: mode === "accept_offer" ? "Customer accepted the pro's offer." : "Customer closed the dispute with no refund.",
      resolved_by: viewer.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", dispute.id);
  await announceRefund(result, viewer.id);
  await notify(dispute.pro_id, {
    subject: `Dispute resolved: ${result.milestoneTitle}`,
    lines: [
      refund > 0
        ? `The customer accepted your offer. ${money(refund)} was refunded to them from your Stripe balance.`
        : "The customer closed the dispute with no refund.",
    ],
    path: proPath,
    cta: "Open the job",
  });
  flash(
    back,
    "notice",
    refund > 0 ? `Resolved. ${money(refund)} is being refunded to you.` : "Dispute closed with no refund.",
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
    lines: ["Our team will review what both sides wrote and decide whether any of the payment is refunded. You will get an email with the outcome."],
    path: otherId === dispute.customer_id ? `/projects/${dispute.project_id}` : await jobPath(admin, dispute.project_id, dispute.pro_id),
  });
  flash(back, "notice", "Our team has been asked to review this. Both sides will be emailed the decision.");
}

/** Platform admin decides how much, if anything, goes back to the customer. */
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

  const result = await closeDisputedMilestone(dispute.milestone_id, refund);
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
  await announceRefund(result, dispute.customer_id);

  const outcome = `Decision on "${result.milestoneTitle}": ${money(refund)} refunded to the customer, ${money(amount - refund)} stays with the pro.`;
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
