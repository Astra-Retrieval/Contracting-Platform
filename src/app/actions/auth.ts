"use server";

import { redirect } from "next/navigation";
import { APP_URL } from "@/lib/config";
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
      data: { role, full_name: fullName, business_name: text(formData.get("business_name")) },
      emailRedirectTo: `${APP_URL}/auth/callback`,
    },
  });
  if (error) flash(back, "error", error.message);
  if (!data.session) {
    flash("/login", "notice", "Check your email for a confirmation link, then sign in.");
  }
  if (role === "pro") {
    flash("/pro/profile", "notice", "Welcome! Fill in your profile so customers can find you.");
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
