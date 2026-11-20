"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { flash, text } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

/** Staff hide a review that breaks the rules, or put it back. Hidden reviews do not count in ratings. */
export async function setReviewHidden(formData: FormData) {
  const viewer = await requireAdmin();
  const back = "/admin/reviews";
  const id = text(formData.get("review_id"));
  const hide = formData.get("hide") === "true";
  const reason = text(formData.get("reason")).slice(0, 300);
  if (hide && reason.length < 5) flash(back, "error", "Add a short reason for hiding the review.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reviews")
    .update(
      hide
        ? { hidden_at: new Date().toISOString(), hidden_by: viewer.id, hidden_reason: reason }
        : { hidden_at: null, hidden_by: null, hidden_reason: "" },
    )
    .eq("id", id)
    .select("pro_id")
    .maybeSingle();
  if (error || !data) flash(back, "error", error?.message ?? "Review not found.");
  revalidatePath(`/pros/${data.pro_id}`);
  flash(back, "notice", hide ? "Review hidden. The pro's rating was recalculated." : "Review restored.");
}

export async function setFeatureRequestStatus(formData: FormData) {
  await requireAdmin();
  const back = "/admin/feedback";
  const status = text(formData.get("status"));
  if (!["new", "planned", "done", "declined"].includes(status)) flash(back, "error", "Unknown status.");
  const { error } = await createAdminClient()
    .from("feature_requests")
    .update({ status, staff_note: text(formData.get("staff_note")).slice(0, 500) })
    .eq("id", text(formData.get("request_id")));
  if (error) flash(back, "error", error.message);
  flash(back, "notice", "Saved.");
}
