import Link from "next/link";
import { notFound } from "next/navigation";
import { Chat, type ChatMessage } from "@/components/chat";
import { requireViewer } from "@/lib/auth";
import { namesById } from "@/lib/data";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const supabase = await createClient();

  // Row-level security returns nothing unless the viewer is in this conversation.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, user_a, user_b")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) notFound();
  const otherId = conversation.user_a === viewer.id ? conversation.user_b : conversation.user_a;

  const [{ data: messages }, names, { data: otherProfile }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", id)
      .order("created_at")
      .limit(500),
    namesById(supabase, [otherId]),
    supabase.from("profiles").select("role").eq("id", otherId).maybeSingle(),
  ]);

  // Mark what the other person sent as read. Users cannot update messages themselves.
  await createAdminClient()
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .neq("sender_id", viewer.id)
    .is("read_at", null);

  const name = names.get(otherId) ?? "Member";
  return (
    <div className="page page-narrow">
      <Link href="/messages" className="text-sm text-stone-500 hover:text-stone-800">
        ← Messages
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-bold tracking-tight">
        {otherProfile?.role === "pro" ? (
          <Link href={`/pros/${otherId}`} className="hover:text-orange-700">
            {name}
          </Link>
        ) : (
          name
        )}
      </h1>
      <Chat conversationId={id} viewerId={viewer.id} initial={(messages ?? []) as ChatMessage[]} />
    </div>
  );
}
