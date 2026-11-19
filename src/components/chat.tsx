"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { sendMessage } from "@/app/actions/messages";
import { PhotoPicker } from "@/components/photo-picker";
import { buttonCls, cn, inputCls } from "@/components/ui";
import { photoUrl } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export type ChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  photo_paths?: string[] | null;
  created_at: string;
};

/** Message thread with live updates over Supabase Realtime. */
export function Chat({
  conversationId,
  viewerId,
  initial,
}: {
  conversationId: string;
  viewerId: string;
  initial: ChatMessage[];
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const add = (m: ChatMessage) =>
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => add(payload.new as ChatMessage),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function submit() {
    const body = draft.trim();
    if (!body && !photos.length) return;
    setError(null);
    startTransition(async () => {
      const result = await sendMessage(conversationId, body, photos);
      if (result.error) setError(result.error);
      else {
        setDraft("");
        setPhotos([]);
        if (result.message) add(result.message);
      }
    });
  }

  return (
    <div className="flex h-[65vh] min-h-96 flex-col rounded-xl border border-stone-200 bg-white">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-500">No messages yet. Say hello.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === viewerId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                  mine ? "bg-brand-200 text-brand-950" : "bg-stone-100 text-stone-900",
                )}
              >
                {(m.photo_paths ?? []).length > 0 && (
                  <span className={cn("flex flex-wrap gap-1.5", m.body && "mb-1.5")}>
                    {(m.photo_paths ?? []).map((p) => (
                      <a key={p} href={photoUrl(p)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoUrl(p)}
                          alt="Photo in this message"
                          className="size-32 rounded-lg object-cover"
                        />
                      </a>
                    ))}
                  </span>
                )}
                {m.body}
                <span
                  className={cn("mt-1 block text-[10px]", mine ? "text-brand-800" : "text-stone-500")}
                >
                  {new Date(m.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {error && <p className="px-4 pb-1 text-sm text-red-700">{error}</p>}
      <div className="border-t border-stone-200 px-3 pt-3">
        <PhotoPicker
          userId={viewerId}
          folder={`messages/${conversationId}`}
          paths={photos}
          onChange={setPhotos}
          label="Add photo"
          compact
        />
      </div>
      <form
        className="flex items-end gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          aria-label="Message"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Write a message…"
          className={cn(inputCls, "max-h-32 min-h-10 resize-y")}
        />
        <button type="submit" disabled={sending || (!draft.trim() && !photos.length)} className={buttonCls("primary")}>
          Send
        </button>
      </form>
    </div>
  );
}
