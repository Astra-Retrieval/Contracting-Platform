"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { APP_URL } from "@/lib/config";
import { flash, text } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const BACK = "/settings";

/** Name and location. Used to pre-fill new projects and shown to people you work with. */
export async function updateAccount(formData: FormData) {
  const viewer = await requireViewer();
  const fullName = text(formData.get("full_name"));
  if (!fullName) flash(BACK, "error", "Please enter your name.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName.slice(0, 120),
      city: text(formData.get("city")).slice(0, 80),
      state: text(formData.get("state")).toUpperCase().slice(0, 2),
    })
    .eq("id", viewer.id);
  if (error) flash(BACK, "error", error.message);
  revalidatePath("/", "layout");
  flash(BACK, "notice", "Your details are saved.");
}

/** Supabase emails a confirmation link; the address changes once it is opened. */
export async function changeEmail(formData: FormData) {
  const viewer = await requireViewer();
  const email = text(formData.get("email")).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) flash(BACK, "error", "Enter a valid email address.");
  if (email === viewer.email.toLowerCase()) flash(BACK, "error", "That is already your email address.");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${APP_URL}/auth/callback` },
  );
  if (error) flash(BACK, "error", error.message);
  flash(BACK, "notice", `We sent a confirmation link to ${email}. Your email changes once you open it.`);
}

export async function changePassword(formData: FormData) {
  const viewer = await requireViewer();
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  if (next.length < 8) flash(BACK, "error", "Use a new password with at least 8 characters.");
  if (next === current) flash(BACK, "error", "The new password is the same as the current one.");

  const supabase = await createClient();
  // Ask for the current password again, so an unattended signed-in browser cannot change it.
  const { error: wrong } = await supabase.auth.signInWithPassword({ email: viewer.email, password: current });
  if (wrong) flash(BACK, "error", "Your current password is not correct.");
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) flash(BACK, "error", error.message);
  flash(BACK, "notice", "Your password is changed.");
}
