import Link from "next/link";
import { Card, Empty, Flash, PageHeader, type SearchParams } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { namesById } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, user_a, user_b, last_message_at")
    .order("last_message_at", { ascending: false });
  const ids = (conversations ?? []).map((c) => c.id);
  const other = (c: { user_a: string; user_b: string }) => (c.user_a === viewer.id ? c.user_b : c.user_a);

  const [names, { data: recent }] = await Promise.all([
    namesById(supabase, (conversations ?? []).map(other)),
    ids.length
      ? supabase
          .from("messages")
          .select("conversation_id, sender_id, body, read_at, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
          .limit(400)
      : Promise.resolve({ data: [] }),
  ]);
  const latest = new Map<string, { body: string; sender_id: string }>();
  const unread = new Map<string, number>();
  for (const m of recent ?? []) {
    if (!latest.has(m.conversation_id)) latest.set(m.conversation_id, m);
    if (m.sender_id !== viewer.id && !m.read_at) {
      unread.set(m.conversation_id, (unread.get(m.conversation_id) ?? 0) + 1);
    }
  }

  return (
    <div className="page page-narrow">
      <Flash params={params} />
      <PageHeader title="Messages" />
      {(conversations ?? []).length === 0 ? (
        <Empty title="No conversations yet">
          Open a pro&apos;s profile or a project and choose &ldquo;Message&rdquo; to start one.
        </Empty>
      ) : (
        <ul className="space-y-2">
          {(conversations ?? []).map((c) => {
            const last = latest.get(c.id);
            const count = unread.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className="block">
                  <Card className="flex items-center justify-between gap-3 hover:border-brand-300">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900">{names.get(other(c)) ?? "Member"}</p>
                      <p className="truncate text-sm text-stone-600">
                        {last ? `${last.sender_id === viewer.id ? "You: " : ""}${last.body}` : "No messages yet"}
                      </p>
                    </div>
                    {count > 0 && (
                      <span className="rounded-full bg-brand-300 px-2 py-0.5 text-xs font-bold text-brand-950">
                        {count} new
                      </span>
                    )}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
