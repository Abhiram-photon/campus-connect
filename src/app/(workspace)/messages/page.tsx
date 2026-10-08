import Link from "next/link";
import { MessageSquare, Users, UserRound } from "lucide-react";
import { ChatPanel, type ChatMessage } from "@/components/chat-panel";
import { EmptyState, PageHeading, StatusTag } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/workspace";
import type { BasicProfileRow, ConversationRow, MessageRow } from "@/lib/db-models";

type NamedItemRow = { id: string; name?: string; title?: string };
type ConversationListItem = ConversationRow & { title: string; detail: string; icon: "direct" | "group" | "mentorship" };

type Props = { searchParams: Promise<{ c?: string; with?: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function MessagesPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user, profile } = await getWorkspaceContext();
  if (profile.role === "organizer") {
    return <div className="page-shell"><PageHeading eyebrow="Campus communication" title="Messaging is not part of the organizer workspace" description="Organizer accounts manage campus events. Direct messaging and group discussion are available to students and faculty through accepted collaboration relationships." /></div>;
  }

  let requestedConversationId = params.c && UUID_RE.test(params.c) ? params.c : null;
  let startMessageError = "";
  if (params.with && UUID_RE.test(params.with)) {
    const { data, error } = await supabase.rpc("get_or_create_direct_conversation", { p_target_id: params.with });
    if (!error && data) requestedConversationId = data;
    else startMessageError = "Direct messaging is available only after an accepted connection, event partner request, group membership, or mentorship acceptance.";
  }

  const { data: conversations } = await supabase.from("conversations").select("id, kind, user_a_id, user_b_id, group_id, session_id, created_at").order("created_at", { ascending: false });
  const available = (conversations ?? []) as ConversationRow[];
  const conversationIds = available.map((conversation) => conversation.id);
  const directPeerIds = available.filter((conversation) => conversation.kind === "direct").map((conversation) => conversation.user_a_id === user.id ? conversation.user_b_id : conversation.user_a_id).filter((id): id is string => Boolean(id));
  const groupIds = available.map((conversation) => conversation.group_id).filter((id): id is string => Boolean(id));
  const sessionIds = available.map((conversation) => conversation.session_id).filter((id): id is string => Boolean(id));
  const [peopleResult, groupsResult, sessionsResult, recentMessagesResult] = await Promise.all([
    directPeerIds.length ? supabase.from("profiles").select("id, full_name, department").in("id", Array.from(new Set(directPeerIds))) : Promise.resolve({ data: [] }),
    groupIds.length ? supabase.from("groups").select("id, name").in("id", Array.from(new Set(groupIds))) : Promise.resolve({ data: [] }),
    sessionIds.length ? supabase.from("mentorship_sessions").select("id, title").in("id", Array.from(new Set(sessionIds))) : Promise.resolve({ data: [] }),
    conversationIds.length ? supabase.from("messages").select("id, conversation_id, sender_id, content, created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
  ]);
  const people = (peopleResult.data ?? []) as BasicProfileRow[];
  const groups = (groupsResult.data ?? []) as NamedItemRow[];
  const sessions = (sessionsResult.data ?? []) as NamedItemRow[];
  const peerById = new Map<string, BasicProfileRow>(people.map((person) => [person.id, person]));
  const groupById = new Map<string, NamedItemRow>(groups.map((group) => [group.id, group]));
  const sessionById = new Map<string, NamedItemRow>(sessions.map((session) => [session.id, session]));

  const namesByUser: Record<string, string> = { [user.id]: profile.full_name };
  for (const person of people) namesByUser[person.id] = person.full_name;
  const recentByConversation = new Map<string, MessageRow>();
  for (const message of (recentMessagesResult.data ?? []) as MessageRow[]) if (!recentByConversation.has(message.conversation_id)) recentByConversation.set(message.conversation_id, message);

  const conversationDetails: ConversationListItem[] = available.map((conversation) => {
    if (conversation.kind === "direct") {
      const peerId = conversation.user_a_id === user.id ? conversation.user_b_id : conversation.user_a_id;
      const person = peerId ? peerById.get(peerId) : undefined;
      return { ...conversation, title: person?.full_name ?? "Campus student", detail: person?.department ?? "Direct conversation", icon: "direct" };
    }
    if (conversation.kind === "group") {
      const group = conversation.group_id ? groupById.get(conversation.group_id) : undefined;
      return { ...conversation, title: group?.name ?? "Faculty group", detail: "Group discussion", icon: "group" };
    }
    const session = conversation.session_id ? sessionById.get(conversation.session_id) : undefined;
    return { ...conversation, title: session?.title ?? "Mentorship discussion", detail: "Mentorship session", icon: "mentorship" };
  });
  const selectedId = requestedConversationId && conversationIds.includes(requestedConversationId)
    ? requestedConversationId
    : requestedConversationId ? null : conversationIds[0] ?? null;
  const selected = conversationDetails.find((conversation) => conversation.id === selectedId) ?? null;

  let initialMessages: ChatMessage[] = [];
  if (selectedId) {
    const { data: messages } = await supabase.from("messages").select("id, conversation_id, sender_id, content, created_at").eq("conversation_id", selectedId).order("created_at", { ascending: true }).limit(100);
    const messageRows = (messages ?? []) as MessageRow[];
    const senderIds = Array.from(new Set(messageRows.map((message) => message.sender_id).filter((id) => !namesByUser[id])));
    if (senderIds.length) {
      const { data: senders } = await supabase.from("profiles").select("id, full_name").in("id", senderIds);
      for (const sender of senders ?? []) namesByUser[sender.id] = sender.full_name;
    }
    initialMessages = messageRows.map((message) => ({
      ...message,
      sender_name: namesByUser[message.sender_id] ?? "Campus member",
    }));
  }

  return (
    <div className="page-shell wide">
      <PageHeading eyebrow="Campus communication" title="Messages" description="Direct and group conversations are available only to accepted collaborators and members." />
      {startMessageError ? <div className="inline-note" role="status" style={{ marginBottom: 13 }}>{startMessageError}</div> : null}
      <div className="message-layout">
        <aside className="conversation-list">
          <div className="conversation-list-head"><div className="section-title">Conversations</div><p className="field-hint" style={{ margin: "3px 0 0" }}>Accepted campus relationships</p></div>
          {conversationDetails.length ? conversationDetails.map((conversation) => {
            const recent = recentByConversation.get(conversation.id);
            const active = conversation.id === selectedId;
            return <Link className={`conversation-item ${active ? "active" : ""}`} href={`/messages?c=${conversation.id}`} key={conversation.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="conversation-name">{conversation.title}</span>
                <StatusTag>{conversation.kind === "direct" ? "Direct" : conversation.kind === "group" ? "Group" : "Mentorship"}</StatusTag>
              </div>
              <div className="conversation-preview">{recent ? `${recent.sender_id === user.id ? "You: " : ""}${recent.content}` : conversation.detail}</div>
              {recent ? <div className="conversation-preview" style={{ marginTop: 2 }}>{formatRelative(recent.created_at)}</div> : null}
            </Link>;
          }) : <div style={{ padding: 14 }}><EmptyState title="No conversations yet">Accept a connection, partner request, group invitation, or mentorship request to begin a permitted conversation.</EmptyState></div>}
        </aside>
        {selected && selectedId ? <ChatPanel
          conversationId={selectedId}
          conversationTitle={selected.title}
          conversationDetail={selected.detail}
          initialMessages={initialMessages}
          currentUserId={user.id}
          currentUserName={profile.full_name}
          initialAuthors={namesByUser}
        /> : <section className="chat-pane">
          <div className="chat-head"><h2 className="section-title">Select a conversation</h2></div>
          <div className="chat-scroll" style={{ display: "grid", placeItems: "center" }}><EmptyState title="No conversation selected">Messages are opened from an accepted collaboration relationship.</EmptyState></div>
        </section>}
      </div>
      <div className="meta-line" style={{ marginTop: 12 }}><span className="meta-item"><MessageSquare size={13} />No open inbox or unsolicited messaging</span><span className="meta-item"><Users size={13} />Group messages are limited to accepted members</span><span className="meta-item"><UserRound size={13} />Blocks immediately revoke direct access</span></div>
    </div>
  );
}
