"use server";

import { requireViewer } from "@/lib/auth";
import { LAUNCH_STATES, isLaunchState } from "@/lib/config";
import { notifyAdmin } from "@/lib/email";
import { flash, text } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

/** A member asks for a feature. Staff read these at /admin/feedback. */
export async function submitFeatureRequest(formData: FormData) {
  const viewer = await requireViewer();
  const body = text(formData.get("body"));
  if (body.length < 5) flash("/feedback", "error", "Tell us a little more about what you would like.");
  if (body.length > 2000) flash("/feedback", "error", "Please keep it under 2,000 characters.");

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("feature_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", viewer.id)
    .gte("created_at", since);
  if ((count ?? 0) >= 10) flash("/feedback", "error", "That is a lot of ideas for one day. Please send more tomorrow.");

  const { error } = await admin.from("feature_requests").insert({ user_id: viewer.id, body });
  if (error) flash("/feedback", "error", error.message);
  await notifyAdmin({
    subject: "New feature request",
    lines: [`${viewer.fullName || viewer.email} (${viewer.role}) asked for:`, body.slice(0, 600)],
    path: "/admin/feedback",
    cta: "Open feature requests",
  });
  flash("/feedback", "notice", "Thank you. We read every request.");
}

/** A pro outside the launch state asks to be told when their state opens. No account needed. */
export async function joinWaitlist(formData: FormData) {
  const name = text(formData.get("name")).slice(0, 120);
  const email = text(formData.get("email")).toLowerCase().slice(0, 200);
  const state = text(formData.get("state")).toUpperCase();
  // A hidden field people never see; bots fill it in.
  if (text(formData.get("website"))) flash("/waitlist", "notice", "You are on the list.");
  if (!name) flash("/waitlist", "error", "Please enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) flash("/waitlist", "error", "Enter a valid email address.");
  if (!/^[A-Z]{2}$/.test(state)) flash("/waitlist", "error", "Choose your state.");
  if (isLaunchState(state)) {
    flash("/signup?role=pro", "notice", `Good news: we are already open in ${LAUNCH_STATES[state]}. Create your account below.`);
  }

  const { error } = await createAdminClient().from("waitlist").insert({
    name,
    email,
    state,
    trade: text(formData.get("trade")).slice(0, 80),
    city: text(formData.get("city")).slice(0, 80),
  });
  if (error && error.code !== "23505") flash("/waitlist", "error", "We could not save that. Please try again.");
  flash("/waitlist", "notice", "You are on the list. We will email you when we open in your state.");
}
