"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { displayName, notify } from "@/lib/email";
import { flash, ownPhotoPaths, text } from "@/lib/format";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** Open the thread between the viewer and another member, creating it if needed. */
export async function startConversation(formData: FormData) {
  const viewer = await requireViewer();
  const otherId = text(formData.get("other_id"));
  if (!otherId || otherId === viewer.id) redirect("/messages");

  const admin = createAdminClient();
  const { data: other } = await admin.from("profiles").select("id").eq("id", otherId).maybeSingle();
  if (!other) flash("/messages", "error", "That member could not be found.");

  // One thread per pair, stored with the smaller id first.
  const [user_a, user_b] = [viewer.id, otherId].sort();
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("user_a", user_a)
    .eq("user_b", user_b)
    .maybeSingle();
  if (existing) redirect(`/messages/${existing.id}`);

  const { data: created, error } = await admin
    .from("conversations")
    .insert({ user_a, user_b })
    .select("id")
    .single();
  if (error || !created) flash("/messages", "error", error?.message ?? "Could not start the conversation.");
  redirect(`/messages/${created.id}`);
}

export async function sendMessage(conversationId: string, body: string, photoPathList: string[] = []) {
  const viewer = await requireViewer();
  const trimmed = body.trim();
  const photos = ownPhotoPaths(photoPathList, viewer.id);
  if (!trimmed && !photos.length) return { error: "Write a message or add a photo first." };
  if (trimmed.length > 5000) return { error: "That message is too long." };

  // Row-level security only allows this for members of the conversation.
  const supabase = await createClient();
  // Email the other person only for the first unread message, not for every line of a chat.
  const { count: alreadyWaiting } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("sender_id", viewer.id)
    .is("read_at", null);
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: viewer.id, body: trimmed, photo_paths: photos })
    .select("id, sender_id, body, photo_paths, created_at")
    .single();
  if (error) return { error: "Message could not be sent." };

  if (!alreadyWaiting) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("user_a, user_b")
      .eq("id", conversationId)
      .maybeSingle();
    if (conversation) {
      const otherId = conversation.user_a === viewer.id ? conversation.user_b : conversation.user_a;
      const name = await displayName(viewer.id);
      await notify(otherId, {
        subject: `New message from ${name}`,
        lines: [
          `${name} sent you a message:`,
          ...(trimmed ? [trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed] : []),
          ...(photos.length ? [photos.length === 1 ? "1 photo attached." : `${photos.length} photos attached.`] : []),
        ],
        path: `/messages/${conversationId}`,
        cta: "Reply",
      });
    }
  }
  return {
    message: data as { id: string; sender_id: string; body: string; photo_paths: string[]; created_at: string },
  };
}
