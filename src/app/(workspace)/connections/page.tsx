import Link from "next/link";
import { ArrowUpRight, MessageSquare, UserPlus, UsersRound } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { EmptyState, PageHeading, SectionHeading, StatusTag } from "@/components/ui";
import {
  cancelPartnerRequestAction, respondConnectionRequestAction, respondPartnerRequestAction,
  sendConnectionRequestAction,
} from "@/app/workspace-actions";
import { formatDate } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/workspace";
import type { BasicProfileRow, ConnectionRow, ConnectionSuggestionRow, PartnerRequestRow } from "@/lib/db-models";

type EventTitleRow = { id: string; title: string };

export default async function ConnectionsPage() {
  const { supabase, user, profile } = await getWorkspaceContext();
  if (profile.role !== "student") {
    return <div className="page-shell"><PageHeading eyebrow="Campus network" title="Connections are for student accounts" description="Faculty and organizer communication is attached to accepted groups, mentorship, and campus workflows." /></div>;
  }

  const [{ data: connectionRows }, { data: partnerRows }, { data: suggestions }] = await Promise.all([
    supabase.from("connections").select("id, user_a_id, user_b_id, requested_by, status, created_at").or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`).order("created_at", { ascending: false }),
    supabase.from("partner_requests").select("id, event_id, sender_id, receiver_id, status, created_at").or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order("created_at", { ascending: false }),
    supabase.rpc("connection_suggestions"),
  ]);

  const connectionRecords = (connectionRows ?? []) as ConnectionRow[];
  const partnerRecords = (partnerRows ?? []) as PartnerRequestRow[];
  const suggestionRecords = (suggestions ?? []) as ConnectionSuggestionRow[];
  const connectionPeers = connectionRecords.map((row) => row.user_a_id === user.id ? row.user_b_id : row.user_a_id);
  const partnerPeers = partnerRecords.flatMap((row) => [row.sender_id, row.receiver_id]);
  const suggestionPeers = suggestionRecords.map((row) => row.user_id);
  const allIds = Array.from(new Set([...connectionPeers, ...partnerPeers, ...suggestionPeers].filter((id) => id !== user.id)));
  const [{ data: people }, { data: events }] = await Promise.all([
    allIds.length ? supabase.from("profiles").select("id, full_name, department, year_or_title").in("id", allIds) : Promise.resolve({ data: [] }),
    partnerRecords.length ? supabase.from("events").select("id, title").in("id", Array.from(new Set(partnerRecords.map((row) => row.event_id)))) : Promise.resolve({ data: [] }),
  ]);
  const peopleById = new Map<string, BasicProfileRow>(((people ?? []) as BasicProfileRow[]).map((person) => [person.id, person]));
  const eventById = new Map<string, EventTitleRow>(((events ?? []) as EventTitleRow[]).map((event) => [event.id, event]));
  const incoming = connectionRecords.filter((row) => row.status === "pending" && row.requested_by !== user.id);
  const outgoing = connectionRecords.filter((row) => row.status === "pending" && row.requested_by === user.id);
  const accepted = connectionRecords.filter((row) => row.status === "accepted");
  const partnerIncoming = partnerRecords.filter((row) => row.status === "pending" && row.receiver_id === user.id);
  const partnerOutgoing = partnerRecords.filter((row) => row.status === "pending" && row.sender_id === user.id);
  const acceptedPartners = partnerRecords.filter((row) => row.status === "accepted");

  return (
    <div className="page-shell wide">
      <PageHeading eyebrow="Campus network" title="Connections" description="Keep persistent campus connections separate from event-specific partner requests." />
      <div className="detail-layout">
        <main>
          <section>
            <SectionHeading title="Connection requests" note={`${incoming.length} received · ${outgoing.length} sent`} />
            {incoming.length || outgoing.length ? <div className="list">
              {incoming.map((row) => {
                const person = peopleById.get(row.requested_by);
                return <div className="list-row" key={row.id}>
                  <div className="list-row-main"><h3 className="row-title"><Link href={`/profile/${row.requested_by}`}>{person?.full_name ?? "Campus student"}</Link></h3><p className="row-copy">{person?.department ?? "Student"}{person?.year_or_title ? ` · ${person.year_or_title}` : ""} · sent {formatDate(row.created_at)}</p></div>
                  <div className="list-row-actions">
                    <ActionForm action={respondConnectionRequestAction} submitLabel="Accept" pendingLabel="Saving…" buttonClassName="btn-small" hideFeedback><input type="hidden" name="connectionId" value={row.id} /><input type="hidden" name="decision" value="accepted" /></ActionForm>
                    <ActionForm action={respondConnectionRequestAction} submitLabel="Decline" pendingLabel="Saving…" buttonVariant="quiet" buttonClassName="btn-small" hideFeedback><input type="hidden" name="connectionId" value={row.id} /><input type="hidden" name="decision" value="declined" /></ActionForm>
                  </div>
                </div>;
              })}
              {outgoing.map((row) => {
                const peerId = row.user_a_id === user.id ? row.user_b_id : row.user_a_id;
                const person = peopleById.get(peerId);
                return <div className="list-row" key={row.id}><div className="list-row-main"><h3 className="row-title"><Link href={`/profile/${peerId}`}>{person?.full_name ?? "Campus student"}</Link></h3><p className="row-copy">Connection request sent · awaiting a response</p></div><StatusTag>Pending</StatusTag></div>;
              })}
            </div> : <EmptyState title="No connection requests">New student connection requests will appear here.</EmptyState>}
          </section>

          <section className="section">
            <SectionHeading title="Event partner requests" note="Collaboration requests are tied to a specific event." />
            {partnerIncoming.length || partnerOutgoing.length || acceptedPartners.length ? <div className="list">
              {partnerIncoming.map((row) => {
                const person = peopleById.get(row.sender_id);
                const event = eventById.get(row.event_id);
                return <div className="list-row" key={row.id}>
                  <div className="list-row-main"><h3 className="row-title">{person?.full_name ?? "Campus student"}</h3><p className="row-copy">Partner request for <strong>{event?.title ?? "a campus event"}</strong></p></div>
                  <div className="list-row-actions">
                    <ActionForm action={respondPartnerRequestAction} submitLabel="Accept" pendingLabel="Saving…" buttonClassName="btn-small" hideFeedback><input type="hidden" name="requestId" value={row.id} /><input type="hidden" name="decision" value="accepted" /></ActionForm>
                    <ActionForm action={respondPartnerRequestAction} submitLabel="Decline" pendingLabel="Saving…" buttonVariant="quiet" buttonClassName="btn-small" hideFeedback><input type="hidden" name="requestId" value={row.id} /><input type="hidden" name="decision" value="declined" /></ActionForm>
                  </div>
                </div>;
              })}
              {partnerOutgoing.map((row) => {
                const person = peopleById.get(row.receiver_id);
                const event = eventById.get(row.event_id);
                return <div className="list-row" key={row.id}>
                  <div className="list-row-main"><h3 className="row-title">Request to {person?.full_name ?? "Campus student"}</h3><p className="row-copy">For {event?.title ?? "a campus event"} · awaiting a response</p></div>
                  <ActionForm action={cancelPartnerRequestAction} submitLabel="Cancel" pendingLabel="Cancelling…" buttonVariant="quiet" buttonClassName="btn-small" hideFeedback><input type="hidden" name="requestId" value={row.id} /></ActionForm>
                </div>;
              })}
              {acceptedPartners.map((row) => {
                const peerId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
                const person = peopleById.get(peerId);
                const event = eventById.get(row.event_id);
                return <div className="list-row" key={row.id}><div className="list-row-main"><h3 className="row-title"><Link href={`/profile/${peerId}`}>{person?.full_name ?? "Campus student"}</Link></h3><p className="row-copy">Event partners · {event?.title ?? "Campus event"}</p></div><Link className="btn btn-small" href={`/messages?with=${peerId}`}><MessageSquare size={13} />Message</Link></div>;
              })}
            </div> : <EmptyState title="No partner requests">Partner requests appear after a student selects you from an event teammate list.</EmptyState>}
          </section>

          <section className="section">
            <SectionHeading title="Your connections" note={`${accepted.length} accepted`} />
            {accepted.length ? <div className="list">{accepted.map((row) => {
              const peerId = row.user_a_id === user.id ? row.user_b_id : row.user_a_id;
              const person = peopleById.get(peerId);
              return <div className="list-row" key={row.id}><div className="list-row-main"><h3 className="row-title"><Link href={`/profile/${peerId}`}>{person?.full_name ?? "Campus student"}</Link></h3><p className="row-copy">{person?.department ?? "Student"}{person?.year_or_title ? ` · ${person.year_or_title}` : ""}</p></div><Link className="btn btn-small" href={`/messages?with=${peerId}`}><MessageSquare size={13} />Message</Link></div>;
            })}</div> : <EmptyState title="You do not have any connections yet">Send a request to a student from a shared campus signal.</EmptyState>}
          </section>
        </main>

        <aside>
          <SectionHeading title="Student suggestions" note="Shown with the reason you may know each other." />
          {suggestionRecords.length ? <div className="list">{suggestionRecords.map((person) => {
            const signals = [person.shared_department ? "Same department" : null, ...(person.shared_skills ?? []).slice(0, 2).map((skill: string) => `Shared skill: ${skill}`), person.shared_event_count ? `${person.shared_event_count} shared event${person.shared_event_count === 1 ? "" : "s"}` : null, person.mutual_connections ? `${person.mutual_connections} mutual connection${person.mutual_connections === 1 ? "" : "s"}` : null].filter((signal): signal is string => typeof signal === "string");
            return <div className="list-row" key={person.user_id}>
              <div className="list-row-main"><h3 className="row-title"><Link href={`/profile/${person.user_id}`}>{person.full_name}</Link></h3><p className="row-copy">{person.department ?? "Student"}{person.year_or_title ? ` · ${person.year_or_title}` : ""}</p><div className="tag-list">{signals.slice(0, 3).map((signal: string) => <StatusTag key={signal}>{signal}</StatusTag>)}</div></div>
              <ActionForm action={sendConnectionRequestAction} submitLabel="Connect" pendingLabel="Sending…" buttonVariant="quiet" buttonClassName="btn-small" hideFeedback><input type="hidden" name="targetId" value={person.user_id} /></ActionForm>
            </div>;
          })}</div> : <EmptyState title="No suggestions yet">More students may appear as shared events, skills, and connections are added.</EmptyState>}
          <p className="field-hint" style={{ marginTop: 14 }}>Signals are visible and explainable. There is no opaque ranking score.</p>
        </aside>
      </div>
    </div>
  );
}
