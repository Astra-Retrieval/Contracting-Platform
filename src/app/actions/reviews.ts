"use server";

import { requireCustomer, requirePro } from "@/lib/auth";
import { displayName, notify } from "@/lib/email";
import { flash, text } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

const parseRating = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

/**
 * Customer reviews a pro who worked on their project: the lead on an accepted quote,
 * or a sub who accepted a role on it. At least one milestone must have been approved.
 */
export async function submitReview(formData: FormData) {
  const viewer = await requireCustomer();
  const admin = createAdminClient();
  const projectId = text(formData.get("project_id"));
  const proId = text(formData.get("pro_id"));
  const rating = parseRating(formData.get("rating"));
  const back = `/projects/${projectId}`;
  if (!rating) flash(back, "error", "Choose a rating from 1 to 5.");

  const { data: project } = await admin
    .from("projects")
    .select("customer_id")
    .eq("id", projectId)
    .maybeSingle();
  if (project?.customer_id !== viewer.id) flash("/projects", "error", "Project not found.");

  const { data: quotes } = await admin
    .from("quotes")
    .select("id, pro_id")
    .eq("project_id", projectId)
    .eq("status", "accepted");
  const quoteIds = (quotes ?? []).map((q) => q.id);
  const { data: released } = await admin
    .from("milestones")
    .select("quote_id")
    .in("quote_id", quoteIds)
    .in("status", ["paid", "disputed", "refunded"]);
  const paidQuoteIds = new Set((released ?? []).map((m) => m.quote_id));
  const { data: subs } = await admin
    .from("project_subs")
    .select("quote_id, sub_id")
    .eq("project_id", projectId)
    .eq("status", "accepted");

  const eligible =
    (quotes ?? []).some((q) => q.pro_id === proId && paidQuoteIds.has(q.id)) ||
    (subs ?? []).some((s) => s.sub_id === proId && paidQuoteIds.has(s.quote_id));
  if (!eligible) {
    flash(back, "error", "You can review a pro once a milestone they worked on has been approved or settled.");
  }

  const { error } = await admin.from("reviews").upsert(
    {
      project_id: projectId,
      reviewer_id: viewer.id,
      pro_id: proId,
      rating,
      body: text(formData.get("body")),
    },
    { onConflict: "project_id,reviewer_id,pro_id" },
  );
  if (error) flash(back, "error", error.message);
  await notify(proId, {
    subject: `You received a ${rating}-star review`,
    lines: [`${viewer.fullName || "A customer"} left you a ${rating}-star review. It is now on your public profile.`],
    path: `/pros/${proId}`,
    cta: "See your profile",
  });
  flash(back, "notice", "Thanks. Your review has been posted.");
}

/**
 * Lead pro rates a sub. Only possible for a sub who accepted a role on one of the lead's
 * accepted quotes, which is what makes the rating "verified".
 */
export async function submitSubRating(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const requestId = text(formData.get("request_id"));
  const back = `/pro/jobs/${requestId}`;
  const rating = parseRating(formData.get("rating"));
  if (!rating) flash(back, "error", "Choose a rating from 1 to 5.");

  const { data: row } = await admin
    .from("project_subs")
    .select("project_id, quote_id, lead_pro_id, sub_id, status")
    .eq("id", text(formData.get("project_sub_id")))
    .maybeSingle();
  if (!row || row.lead_pro_id !== viewer.id || row.status !== "accepted") {
    flash(back, "error", "You can only rate subs who accepted a role on your job.");
  }
  const { data: quote } = await admin
    .from("quotes")
    .select("status")
    .eq("id", row.quote_id)
    .maybeSingle();
  if (quote?.status !== "accepted") {
    flash(back, "error", "You can rate subs once the customer has accepted the quote.");
  }

  const { error } = await admin.from("sub_ratings").upsert(
    {
      project_id: row.project_id,
      lead_pro_id: viewer.id,
      sub_id: row.sub_id,
      rating,
      body: text(formData.get("body")),
    },
    { onConflict: "project_id,lead_pro_id,sub_id" },
  );
  if (error) flash(back, "error", error.message);
  await notify(row.sub_id, {
    subject: `You received a ${rating}-star rating from a contractor`,
    lines: [
      `${await displayName(viewer.id)} rated your work as a sub ${rating} out of 5. It shows on your profile as a verified rating.`,
    ],
    path: `/pros/${row.sub_id}`,
    cta: "See your profile",
  });
  flash(back, "notice", "Rating saved.");
}
