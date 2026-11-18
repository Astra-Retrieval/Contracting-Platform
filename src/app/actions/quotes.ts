"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer, requirePro } from "@/lib/auth";
import { displayName, notify, projectTitle } from "@/lib/email";
import { flash, money, text, toCents } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

// Quotes and milestones are written with the service-role client, so every action
// here first checks that the signed-in user is the right party.

/** Pro submits (or revises) a quote with its payment milestones. */
export async function submitQuote(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const requestId = text(formData.get("request_id"));
  const back = `/pro/jobs/${requestId}`;

  const { data: request } = await admin
    .from("quote_requests")
    .select("id, project_id, pro_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.pro_id !== viewer.id) flash("/pro/jobs", "error", "Request not found.");
  if (!["pending", "quoted"].includes(request.status)) {
    flash(back, "error", "This request is no longer open for quotes.");
  }

  const titles = formData.getAll("milestone_title").map((v) => text(v));
  const amounts = formData.getAll("milestone_amount").map((v) => toCents(v));
  const milestones = titles
    .map((title, i) => ({ title, amount_cents: amounts[i] ?? 0, sort: i }))
    .filter((m) => m.title || m.amount_cents);
  if (!milestones.length) flash(back, "error", "Add at least one milestone.");
  if (milestones.some((m) => !m.title || m.amount_cents < 100)) {
    flash(back, "error", "Every milestone needs a name and an amount of at least $1.");
  }
  const total = milestones.reduce((sum, m) => sum + m.amount_cents, 0);

  // A revised quote replaces the earlier one, along with any sub invites made on it.
  const { data: replaced } = await admin
    .from("quotes")
    .update({ status: "withdrawn" })
    .eq("request_id", requestId)
    .eq("status", "submitted")
    .select("id");
  if (replaced?.length) {
    await admin
      .from("project_subs")
      .update({ status: "removed" })
      .in("quote_id", replaced.map((q) => q.id));
  }

  const { data: quote, error } = await admin
    .from("quotes")
    .insert({
      request_id: requestId,
      project_id: request.project_id,
      pro_id: viewer.id,
      amount_cents: total,
      timeline: text(formData.get("timeline")),
      scope: text(formData.get("scope")),
    })
    .select("id")
    .single();
  if (error || !quote) flash(back, "error", error?.message ?? "Could not save the quote.");

  await admin.from("milestones").insert(
    milestones.map((m) => ({ ...m, quote_id: quote.id, project_id: request.project_id })),
  );
  await admin.from("quote_requests").update({ status: "quoted" }).eq("id", requestId);

  const { data: project } = await admin
    .from("projects")
    .select("title, customer_id")
    .eq("id", request.project_id)
    .single();
  await notify(project?.customer_id, {
    subject: `New quote for ${project?.title}: ${money(total)}`,
    lines: [
      `${await displayName(viewer.id)} sent a quote of ${money(total)} for "${project?.title}".`,
      "Open your project to see the scope, timeline and payment milestones, and to compare it with your other quotes.",
    ],
    path: `/projects/${request.project_id}`,
    cta: "Review the quote",
  });

  flash(back, "notice", "Quote sent to the customer.");
}

export async function declineRequest(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const requestId = text(formData.get("request_id"));
  const { data: declined } = await admin
    .from("quote_requests")
    .update({ status: "declined" })
    .eq("id", requestId)
    .eq("pro_id", viewer.id)
    .in("status", ["pending", "quoted"])
    .select("project_id")
    .maybeSingle();
  if (declined) {
    const { data: project } = await admin
      .from("projects")
      .select("title, customer_id")
      .eq("id", declined.project_id)
      .single();
    await notify(project?.customer_id, {
      subject: `${await displayName(viewer.id)} can't take on ${project?.title}`,
      lines: [
        `${await displayName(viewer.id)} declined your quote request for "${project?.title}".`,
        "You can request quotes from other pros at any time.",
      ],
      path: `/pros?project=${declined.project_id}`,
      cta: "Find other pros",
    });
  }
  await admin
    .from("quotes")
    .update({ status: "withdrawn" })
    .eq("request_id", requestId)
    .eq("pro_id", viewer.id)
    .eq("status", "submitted");
  flash("/pro/jobs", "notice", "Request declined.");
}

/** Customer accepts a quote: it joins the project and its budget. */
export async function acceptQuote(formData: FormData) {
  const viewer = await requireCustomer();
  const admin = createAdminClient();
  const quoteId = text(formData.get("quote_id"));

  const { data: quote } = await admin
    .from("quotes")
    .select("id, request_id, project_id, pro_id, amount_cents, status")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) flash("/projects", "error", "Quote not found.");
  const back = `/projects/${quote.project_id}`;

  const { data: project } = await admin
    .from("projects")
    .select("id, customer_id")
    .eq("id", quote.project_id)
    .maybeSingle();
  if (!project || project.customer_id !== viewer.id) flash("/projects", "error", "Quote not found.");
  if (quote.status !== "submitted") flash(back, "error", "This quote can no longer be accepted.");

  const { data: pro } = await admin
    .from("pro_profiles")
    .select("business_name")
    .eq("user_id", quote.pro_id)
    .single();

  await admin.from("quotes").update({ status: "accepted" }).eq("id", quote.id);
  await admin.from("quote_requests").update({ status: "accepted" }).eq("id", quote.request_id);
  await admin.from("projects").update({ status: "in_progress" }).eq("id", quote.project_id);
  await admin.from("budget_items").upsert(
    {
      project_id: quote.project_id,
      quote_id: quote.id,
      label: pro?.business_name || "Accepted quote",
      planned_cents: quote.amount_cents,
    },
    { onConflict: "quote_id" },
  );

  await notify(quote.pro_id, {
    subject: `Your quote was accepted: ${await projectTitle(quote.project_id)}`,
    lines: [
      `${viewer.fullName || "The customer"} accepted your quote of ${money(quote.amount_cents)} for "${await projectTitle(quote.project_id)}".`,
      "You will get another email when they pay the first milestone. Make sure your payout setup is finished so you can be paid.",
    ],
    path: `/pro/jobs/${quote.request_id}`,
    cta: "Open the job",
  });
  flash(back, "notice", "Quote accepted and added to your budget. Pay the first milestone to get started.");
}

export async function rejectQuote(formData: FormData) {
  const viewer = await requireCustomer();
  const admin = createAdminClient();
  const quoteId = text(formData.get("quote_id"));
  const { data: quote } = await admin
    .from("quotes")
    .select("id, request_id, project_id, pro_id, status")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return;
  const { data: project } = await admin
    .from("projects")
    .select("customer_id")
    .eq("id", quote.project_id)
    .maybeSingle();
  if (project?.customer_id !== viewer.id || quote.status !== "submitted") return;

  await admin.from("quotes").update({ status: "rejected" }).eq("id", quote.id);
  await admin.from("quote_requests").update({ status: "closed" }).eq("id", quote.request_id);
  await notify(quote.pro_id, {
    subject: `Update on your quote for ${await projectTitle(quote.project_id)}`,
    lines: [`The customer decided not to go ahead with your quote for "${await projectTitle(quote.project_id)}".`],
    path: "/pro/jobs",
    cta: "See your leads",
  });
  revalidatePath(`/projects/${quote.project_id}`);
}

/** Pro marks a paid milestone as finished so the customer can approve it. */
export async function markMilestoneComplete(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const milestoneId = text(formData.get("milestone_id"));
  const requestId = text(formData.get("request_id"));

  const { data: milestone } = await admin
    .from("milestones")
    .select("id, quote_id, project_id, title")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) return;
  const { data: quote } = await admin
    .from("quotes")
    .select("pro_id")
    .eq("id", milestone.quote_id)
    .maybeSingle();
  if (quote?.pro_id !== viewer.id) return;

  const { data: updated } = await admin
    .from("milestones")
    .update({ status: "submitted" })
    .eq("id", milestoneId)
    .eq("status", "funded")
    .select("id")
    .maybeSingle();
  if (updated) {
    const { data: project } = await admin
      .from("projects")
      .select("title, customer_id")
      .eq("id", milestone.project_id)
      .single();
    await notify(project?.customer_id, {
      subject: `Ready for your approval: ${milestone.title}`,
      lines: [
        `${await displayName(viewer.id)} marked "${milestone.title}" on "${project?.title}" as complete.`,
        "Check the work, then approve it to release the payment. If something is wrong, you can report a problem instead.",
      ],
      path: `/projects/${milestone.project_id}`,
      cta: "Review and approve",
    });
  }
  flash(`/pro/jobs/${requestId}`, "notice", "Marked complete. The customer can now approve it.");
}
