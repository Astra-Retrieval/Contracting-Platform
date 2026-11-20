"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requirePro } from "@/lib/auth";
import { credentialType } from "@/lib/credentials";
import { refreshDocsStatus } from "@/lib/credentials-server";
import { displayName, notify, notifyAdmin } from "@/lib/email";
import { flash, shortDate, text, toCents } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

const BACK = "/pro/credentials";

/** Pro records a document. The file was already uploaded to their own private folder. */
export async function addCredential(formData: FormData) {
  const viewer = await requirePro();
  const type = credentialType(text(formData.get("type")));
  if (!type) flash(BACK, "error", "Choose what kind of document this is.");
  const path = text(formData.get("file_path"));
  if (!path.startsWith(`${viewer.id}/`) || path.includes("..")) {
    flash(BACK, "error", "Upload the document first.");
  }
  const expires = text(formData.get("expires_on"));
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) flash(BACK, "error", "Enter the expiry date.");
  if (expires && expires < new Date().toISOString().slice(0, 10)) {
    flash(BACK, "error", "That document has already expired. Upload the current one.");
  }
  const number = text(formData.get("number")).slice(0, 60);
  if (type.kind === "license" && !number) flash(BACK, "error", "Enter the license or registration number.");

  const admin = createAdminClient();
  const { error } = await admin.from("pro_credentials").insert({
    pro_id: viewer.id,
    type: type.id,
    number,
    holder_name: text(formData.get("holder_name")).slice(0, 120),
    classification: text(formData.get("classification")).slice(0, 120),
    coverage_cents: type.hasCoverage ? toCents(formData.get("coverage")) || null : null,
    expires_on: expires || null,
    file_path: path,
  });
  if (error) flash(BACK, "error", error.message);
  await refreshDocsStatus(viewer.id, admin);
  await notifyAdmin({
    subject: `Document to check: ${type.label}`,
    lines: [`${await displayName(viewer.id)} uploaded "${type.label}"${number ? ` (number ${number})` : ""}.`],
    path: "/admin/credentials",
    cta: "Review documents",
  });
  revalidatePath(`/pros/${viewer.id}`);
  flash(BACK, "notice", `${type.label} added. Customers can see it now, marked as not yet checked.`);
}

export async function deleteCredential(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const { data } = await admin
    .from("pro_credentials")
    .delete()
    .eq("id", text(formData.get("credential_id")))
    .eq("pro_id", viewer.id)
    .select("file_path")
    .maybeSingle();
  if (data?.file_path) await admin.storage.from("credentials").remove([data.file_path]);
  await refreshDocsStatus(viewer.id, admin);
  revalidatePath(`/pros/${viewer.id}`);
  flash(BACK, "notice", "Document removed.");
}

/** Staff confirm a document against the issuer, or reject it with a reason. */
export async function reviewCredential(formData: FormData) {
  const viewer = await requireAdmin();
  const back = "/admin/credentials";
  const decision = text(formData.get("decision"));
  if (!["verified", "rejected", "pending"].includes(decision)) flash(back, "error", "Unknown decision.");
  const note = text(formData.get("note")).slice(0, 500);
  if (decision === "rejected" && note.length < 5) {
    flash(back, "error", "Say why, so the pro knows what to fix. They will see this note.");
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("pro_credentials")
    .update({
      status: decision,
      review_note: note,
      reviewed_by: decision === "pending" ? null : viewer.id,
      reviewed_at: decision === "pending" ? null : new Date().toISOString(),
    })
    .eq("id", text(formData.get("credential_id")))
    .select("pro_id, type, expires_on")
    .maybeSingle();
  if (error || !row) flash(back, "error", error?.message ?? "Document not found.");
  await refreshDocsStatus(row.pro_id, admin);
  revalidatePath(`/pros/${row.pro_id}`);

  const label = credentialType(row.type)?.label ?? "Your document";
  if (decision === "verified") {
    await notify(row.pro_id, {
      subject: `Checked: ${label}`,
      lines: [
        `We checked your ${label} and it now shows as checked on your profile.`,
        ...(row.expires_on ? [`It expires on ${shortDate(row.expires_on)}. We will remind you a month before.`] : []),
      ],
      path: BACK,
      cta: "View your documents",
    });
  } else if (decision === "rejected") {
    await notify(row.pro_id, {
      subject: `We could not confirm your ${label}`,
      lines: [`We could not confirm your ${label}.`, `Note from our team: ${note}`, "Please upload a corrected document."],
      path: BACK,
      cta: "Upload a document",
    });
  }
  flash(back, "notice", decision === "verified" ? "Marked as checked. The pro was emailed." : decision === "rejected" ? "Rejected. The pro was emailed." : "Moved back to waiting.");
}
