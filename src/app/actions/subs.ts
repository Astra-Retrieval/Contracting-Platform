"use server";

import { revalidatePath } from "next/cache";
import { requirePro } from "@/lib/auth";
import { displayName, notify, projectTitle } from "@/lib/email";
import { flash, money, text, toCents } from "@/lib/format";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** Add or remove a pro from the viewer's private list of favorite subs. */
export async function toggleFavorite(formData: FormData) {
  const viewer = await requirePro();
  const supabase = await createClient();
  const subId = text(formData.get("sub_id"));
  const back = text(formData.get("back")) || "/pro/subs";
  if (!subId || subId === viewer.id) return;

  const { data: existing } = await supabase
    .from("favorite_subs")
    .select("sub_id")
    .eq("pro_id", viewer.id)
    .eq("sub_id", subId)
    .maybeSingle();
  if (existing) {
    await supabase.from("favorite_subs").delete().eq("pro_id", viewer.id).eq("sub_id", subId);
  } else {
    await supabase.from("favorite_subs").insert({ pro_id: viewer.id, sub_id: subId });
  }
  revalidatePath(back);
}

/** Lead pro invites a sub onto one of their quotes with a scope and an agreed amount. */
export async function inviteSub(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const requestId = text(formData.get("request_id"));
  const quoteId = text(formData.get("quote_id"));
  const subId = text(formData.get("sub_id"));
  const amount = toCents(formData.get("amount"));
  const back = `/pro/jobs/${requestId}`;

  const { data: quote } = await admin
    .from("quotes")
    .select("id, project_id, pro_id, amount_cents, status")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || quote.pro_id !== viewer.id) flash("/pro/jobs", "error", "Quote not found.");
  if (!["submitted", "accepted"].includes(quote.status)) {
    flash(back, "error", "Subs can only be added to an open or accepted quote.");
  }
  if (!subId || subId === viewer.id) flash(back, "error", "Choose a sub to invite.");
  if (amount < 100) flash(back, "error", "Enter the amount this sub will be paid.");

  const { data: sub } = await admin
    .from("pro_profiles")
    .select("user_id")
    .eq("user_id", subId)
    .maybeSingle();
  if (!sub) flash(back, "error", "That pro could not be found.");

  // The lead pays subs out of what the customer pays them. Don't promise more than the quote.
  const { data: others } = await admin
    .from("project_subs")
    .select("sub_id, amount_cents")
    .eq("quote_id", quoteId)
    .in("status", ["invited", "accepted"]);
  const committed = (others ?? [])
    .filter((o) => o.sub_id !== subId)
    .reduce((sum, o) => sum + Number(o.amount_cents), 0);
  if (committed + amount > Number(quote.amount_cents)) {
    flash(back, "error", `Sub amounts can total at most ${money(quote.amount_cents)}, the size of this quote.`);
  }

  const { error } = await admin.from("project_subs").upsert(
    {
      project_id: quote.project_id,
      quote_id: quoteId,
      lead_pro_id: viewer.id,
      sub_id: subId,
      scope: text(formData.get("scope")),
      amount_cents: amount,
      status: "invited",
    },
    { onConflict: "quote_id,sub_id" },
  );
  if (error) flash(back, "error", error.message);
  await notify(subId, {
    subject: `${await displayName(viewer.id)} wants you on a job`,
    lines: [
      `${await displayName(viewer.id)} invited you to work as a sub on "${await projectTitle(quote.project_id)}" for ${money(amount)}.`,
      "Open the invitation to see your part of the job, then accept or decline.",
    ],
    path: "/pro/subs",
    cta: "View the invitation",
  });
  flash(back, "notice", "Invitation sent. The sub needs to accept before they are on the job.");
}

/** Sub accepts or declines an invitation. */
export async function respondToSubInvite(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const accept = formData.get("response") === "accept";
  const { data: row } = await admin
    .from("project_subs")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", text(formData.get("id")))
    .eq("sub_id", viewer.id)
    .eq("status", "invited")
    .select("project_id, lead_pro_id")
    .maybeSingle();
  if (row) {
    const { data: request } = await admin
      .from("quote_requests")
      .select("id")
      .eq("project_id", row.project_id)
      .eq("pro_id", row.lead_pro_id)
      .maybeSingle();
    await notify(row.lead_pro_id, {
      subject: `${await displayName(viewer.id)} ${accept ? "accepted" : "declined"} your sub invitation`,
      lines: [
        `${await displayName(viewer.id)} ${accept ? "accepted" : "declined"} your invitation to work on "${await projectTitle(row.project_id)}".`,
      ],
      path: request ? `/pro/jobs/${request.id}` : "/pro/jobs",
      cta: "Open the job",
    });
  }
  flash("/pro/subs", "notice", accept ? "You're on the job." : "Invitation declined.");
}

/** Lead pro removes a sub from a quote. */
export async function removeSub(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const requestId = text(formData.get("request_id"));
  await admin
    .from("project_subs")
    .update({ status: "removed" })
    .eq("id", text(formData.get("id")))
    .eq("lead_pro_id", viewer.id);
  revalidatePath(`/pro/jobs/${requestId}`);
}
