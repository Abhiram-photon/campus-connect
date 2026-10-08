"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Radio } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { sendMessageAction } from "@/app/workspace-actions";
import { formatDate } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name: string;
}

export function ChatPanel({
  conversationId,
  conversationTitle,
  conversationDetail,
  initialMessages,
  currentUserId,
  currentUserName,
  initialAuthors,
}: {
  conversationId: string;
  conversationTitle: string;
  conversationDetail: string;
  initialMessages: ChatMessage[];
  currentUserId: string;
  currentUserName: string;
  initialAuthors: Record<string, string>;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [live, setLive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    let disposed = false;
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null = null;
    try {
      supabase = createSupabaseBrowserClient();
      channel = supabase
        .channel(`messages:${conversationId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        }, async (payload: { new: Omit<ChatMessage, "sender_name"> }) => {
          const row = payload.new;
          let senderName = row.sender_id === currentUserId ? currentUserName : initialAuthors[row.sender_id] ?? "Campus member";
          setMessages((current) => current.some((message) => message.id === row.id) ? current : [...current, { ...row, sender_name: senderName }]);
          if (row.sender_id !== currentUserId && !initialAuthors[row.sender_id] && supabase) {
            const { data } = await supabase.from("profiles").select("full_name").eq("id", row.sender_id).maybeSingle();
            if (data?.full_name && !disposed) {
              senderName = data.full_name;
              setMessages((current) => current.map((message) => message.id === row.id ? { ...message, sender_name: senderName } : message));
            }
          }
        })
        .subscribe((status: string) => setLive(status === "SUBSCRIBED"));
    } catch {
      setLive(false);
    }
    return () => {
      disposed = true;
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, currentUserName, initialAuthors]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <section className="chat-pane" aria-label={`Conversation with ${conversationTitle}`}>
      <div className="chat-head">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div><h2 className="section-title">{conversationTitle}</h2><p className="field-hint" style={{ margin: "2px 0 0" }}>{conversationDetail}</p></div>
          <span className="chat-live" title={live ? "Realtime connected" : "Realtime reconnecting"}>{live ? <Radio size={13} /> : <Circle size={9} />} {live ? "Live" : "Connecting"}</span>
        </div>
      </div>
      <div className="chat-scroll" ref={scrollRef} aria-live="polite">
        {messages.length ? messages.map((message) => <article className={`chat-message ${message.sender_id === currentUserId ? "mine" : ""}`} key={message.id}>
          <div className="chat-sender">{message.sender_id === currentUserId ? "You" : message.sender_name}</div>
          <div className="chat-content">{message.content}</div>
          <div className="chat-time">{formatDate(message.created_at, true)}</div>
        </article>) : <div className="empty-state" style={{ marginTop: 72 }}><strong>No messages yet</strong><p>Keep the conversation focused on the collaboration.</p></div>}
      </div>
      <ActionForm action={sendMessageAction} submitLabel="Send" pendingLabel="Sending…" buttonClassName="" className="chat-composer">
        <input type="hidden" name="conversationId" value={conversationId} />
        <textarea className="control" name="content" maxLength={5000} required rows={1} placeholder="Write a message…" aria-label="Message" />
      </ActionForm>
    </section>
  );
}
