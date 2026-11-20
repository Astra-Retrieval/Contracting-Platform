"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { APP_URL } from "@/lib/config";
import { credentialType } from "@/lib/credentials";
import { flash, text } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: text(formData.get("email")),
    password: String(formData.get("password") ?? ""),
  });
  if (error) flash("/login", "error", error.message);
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const role = formData.get("role") === "pro" ? "pro" : "customer";
  const fullName = text(formData.get("full_name"));
  const password = String(formData.get("password") ?? "");
  const back = `/signup?role=${role}`;
  if (!fullName) flash(back, "error", "Please enter your name.");
  if (password.length < 8) flash(back, "error", "Use a password with at least 8 characters.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: text(formData.get("email")),
    password,
    options: {
      data: {
        role,
        full_name: fullName,
        business_name: text(formData.get("business_name")),
        // Pros: the trades ticked on the form (saved by the database on sign-up) and the
        // documents they say they hold (shown back to them as a list to upload).
        ...(role === "pro"
          ? {
              trades: formData.getAll("trade").map(String).filter((v) => /^\d{1,4}$/.test(v)).slice(0, 40),
              docs: formData.getAll("doc").map(String).filter((v) => credentialType(v)).slice(0, 30),
            }
          : {}),
      },
      emailRedirectTo: `${APP_URL}/auth/callback`,
    },
  });
  if (error) flash(back, "error", error.message);
  if (!data.session) {
    flash("/login", "notice", "Check your email for a confirmation link, then sign in.");
  }
  if (role === "pro") {
    flash("/pro/credentials", "notice", "Welcome! Upload your licenses and insurance, then fill in your profile.");
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** Emails a link that signs the person in and takes them to the new-password page. */
export async function requestPasswordReset(formData: FormData) {
  const email = text(formData.get("email")).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) flash("/forgot-password", "error", "Enter a valid email address.");

  // The link comes back to /auth/callback in this same browser; this tells it where to go next.
  (await cookies()).set("auth_next", "/reset-password", {
    httpOnly: true,
    sameSite: "lax",
    secure: APP_URL.startsWith("https://"),
    maxAge: 60 * 60,
    path: "/",
  });
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/auth/callback` });
  if (error) console.error("Password reset email failed", error.message);
  // Same answer whether or not the address has an account.
  flash(
    "/forgot-password",
    "notice",
    "If that email has an account, a reset link is on its way. Open it on this device.",
  );
}

export async function setNewPassword(formData: FormData) {
  await requireViewer();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) flash("/reset-password", "error", "Use a password with at least 8 characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) flash("/reset-password", "error", error.message);
  flash("/dashboard", "notice", "Your password is changed.");
}
