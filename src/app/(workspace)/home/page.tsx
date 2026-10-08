import Link from "next/link";
import { ArrowUpRight, CalendarDays, Users, UserRoundPlus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { EmptyState, PageHeading, SectionHeading, StatusTag } from "@/components/ui";
import { registerForEventAction, sendConnectionRequestAction } from "@/app/workspace-actions";
import { eventStatusLabel, formatDate } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/workspace";
import type { ConnectionSuggestionRow, EventListRow, GroupRow, MentorshipSessionRow, OrganizerDashboardEventRow } from "@/lib/db-models";

export default async function HomePage() {
  const { supabase, user, profile } = await getWorkspaceContext();

  if (profile.role === "student") {
    const { data: events } = await supabase.from("events").select("id, title, description, organizer_id, event_date, registration_deadline, status")
      .in("status", ["registration_open", "upcoming"]).gt("event_date", new Date().toISOString()).order("event_date").limit(6);
    const eventIds = (events ?? []).map((event: { id: string }) => event.id);
    const { data: registrations } = eventIds.length
      ? await supabase.from("event_registrations").select("event_id, status, looking_for_teammates").eq("user_id", user.id).in("event_id", eventIds)
      : { data: [] as { event_id: string; status: string; looking_for_teammates: boolean }[] };
    const registrationByEvent = new Map((registrations ?? []).map((registration: { event_id: string; status: string; looking_for_teammates: boolean }) => [registration.event_id, registration]));
    const { data: suggestions } = await supabase.rpc("connection_suggestions");

    return (
      <div className="page-shell wide">
        <PageHeading eyebrow="Student workspace" title={`Good to see you, ${profile.full_name.split(" ")[0]}`} description="Your campus collaboration starts with the next event, question, or connection." />
        <div className="split-layout">
          <section className="section" aria-labelledby="upcoming-title">
            <SectionHeading title="Campus events" note="Upcoming events with registration available." action={<Link className="text-link" href="/events">All events <ArrowUpRight size={13} style={{ verticalAlign: "-2px" }} /></Link>} />
            {events?.length ? <div className="list">
              {events.map((event: EventListRow) => {
                const registration = registrationByEvent.get(event.id) as { status: string; looking_for_teammates: boolean } | undefined;
                const active = registration?.status === "registered";
                return (
                  <article className="list-row" key={event.id}>
                    <div className="list-row-main">
                      <h3 className="row-title"><Link href={`/events/${event.id}`}>{event.title}</Link></h3>
                      <p className="row-copy">{event.description.length > 190 ? `${event.description.slice(0, 190).trim()}…` : event.description}</p>
                      <div className="meta-line">
                        <span className="meta-item"><CalendarDays size={13} />{formatDate(event.event_date, true)}</span>
                        <StatusTag tone={event.status === "registration_open" ? "accent" : "neutral"}>{eventStatusLabel(event.status)}</StatusTag>
                      </div>
                    </div>
                    <div className="list-row-actions">
                      {active ? <Link href={`/events/${event.id}`} className="btn btn-default">{registration?.looking_for_teammates ? "View matches" : "Find teammates"}</Link> : event.status === "registration_open" ? (
                        <ActionForm action={registerForEventAction} submitLabel="Register" pendingLabel="Registering…" buttonClassName="btn-small" hideFeedback>
                          <input type="hidden" name="eventId" value={event.id} />
                        </ActionForm>
                      ) : <Link href={`/events/${event.id}`} className="btn btn-small">View event</Link>}
                    </div>
                  </article>
                );
              })}
            </div> : <EmptyState title="No upcoming events listed">Check again later or ask your campus organizer to publish one.</EmptyState>}
          </section>
          <aside className="section">
            <SectionHeading title="People to know" note="Explainable signals from your campus network." action={<Link href="/connections" className="text-link">Connections</Link>} />
            {suggestions?.length ? <div className="list">
              {suggestions.slice(0, 4).map((person: ConnectionSuggestionRow) => {
                const signals = [
                  person.shared_department ? "Same department" : null,
                  ...(person.shared_skills ?? []).slice(0, 2).map((skill: string) => `Shared skill: ${skill}`),
                  person.shared_event_count ? `${person.shared_event_count} shared event${person.shared_event_count === 1 ? "" : "s"}` : null,
                  person.mutual_connections ? `${person.mutual_connections} mutual connection${person.mutual_connections === 1 ? "" : "s"}` : null,
                ].filter((signal): signal is string => typeof signal === "string");
                return (
                  <div className="list-row" key={person.user_id}>
                    <div className="list-row-main">
                      <h3 className="row-title"><Link href={`/profile/${person.user_id}`}>{person.full_name}</Link></h3>
                      <p className="row-copy">{person.department ?? "Student"}{person.year_or_title ? ` · ${person.year_or_title}` : ""}</p>
                      <div className="tag-list">{signals.slice(0, 3).map((signal: string) => <StatusTag key={signal}>{signal}</StatusTag>)}</div>
                    </div>
                    <ActionForm action={sendConnectionRequestAction} submitLabel="Connect" pendingLabel="Sending…" buttonVariant="quiet" buttonClassName="btn-small" hideFeedback>
                      <input type="hidden" name="targetId" value={person.user_id} />
                    </ActionForm>
                  </div>
                );
              })}
            </div> : <EmptyState title="No suggestions yet">Shared skills, events, department, and mutual connections will make suggestions useful.</EmptyState>}
            <div className="inline-note" style={{ marginTop: 18 }}>Suggestions are based on shared campus information, not compatibility scoring.</div>
          </aside>
        </div>
      </div>
    );
  }

  if (profile.role === "faculty") {
    const [{ data: sessions }, { data: groups }] = await Promise.all([
      supabase.from("mentorship_sessions").select("id, title, session_date, capacity, status").eq("faculty_id", user.id).order("session_date", { ascending: true }).limit(6),
      supabase.from("groups").select("id, name, description, created_at").eq("faculty_id", user.id).order("created_at", { ascending: false }).limit(6),
    ]);
    const groupIds = (groups ?? []).map((group: { id: string }) => group.id);
    const { data: members } = groupIds.length ? await supabase.from("group_members").select("group_id, status").in("group_id", groupIds) : { data: [] as { group_id: string; status: string }[] };
    const groupCounts = new Map<string, number>();
    for (const member of members ?? []) if (member.status === "accepted") groupCounts.set(member.group_id, (groupCounts.get(member.group_id) ?? 0) + 1);
    return (
      <div className="page-shell wide">
        <PageHeading eyebrow="Faculty workspace" title={`Welcome, ${profile.full_name.split(" ")[0]}`} description="Manage your groups and mentorship opportunities from one place." />
        <div className="detail-layout">
          <section>
            <SectionHeading title="Mentorship sessions" action={<Link className="text-link" href="/mentorship">Manage sessions <ArrowUpRight size={13} style={{ verticalAlign: "-2px" }} /></Link>} />
            {sessions?.length ? <div className="list">{sessions.map((session: MentorshipSessionRow) => <div className="list-row" key={session.id}>
              <div className="list-row-main"><h3 className="row-title"><Link href={`/mentorship?session=${session.id}`}>{session.title}</Link></h3><div className="meta-line"><span>{formatDate(session.session_date, true)}</span><span>Capacity {session.capacity}</span><StatusTag tone={session.status === "published" ? "accent" : "neutral"}>{session.status}</StatusTag></div></div>
              <Link className="btn btn-small" href={`/mentorship?session=${session.id}`}>Review requests</Link>
            </div>)}</div> : <EmptyState title="No sessions yet">Publish a mentorship opportunity when you are ready to meet with students.</EmptyState>}
          </section>
          <section>
            <SectionHeading title="Faculty groups" action={<Link className="text-link" href="/groups">Manage groups <ArrowUpRight size={13} style={{ verticalAlign: "-2px" }} /></Link>} />
            {groups?.length ? <div className="list">{groups.map((group: GroupRow) => <div className="list-row" key={group.id}>
              <div className="list-row-main"><h3 className="row-title"><Link href={`/groups?group=${group.id}`}>{group.name}</Link></h3><p className="row-copy">{group.description || "Faculty-created collaboration group."}</p><div className="meta-line"><span><Users size={13} />{groupCounts.get(group.id) ?? 0} accepted member{groupCounts.get(group.id) === 1 ? "" : "s"}</span></div></div>
              <Link className="btn btn-small" href={`/groups?group=${group.id}`}>Manage</Link>
            </div>)}</div> : <EmptyState title="No groups created">Create a group and invite students to join the discussion.</EmptyState>}
          </section>
        </div>
        <div className="section"><div className="inline-note">Direct messages are available only after an accepted connection, partner request, group membership, or mentorship acceptance.</div></div>
      </div>
    );
  }

  const { data: events } = await supabase.from("events").select("id, title, event_date, registration_deadline, status").eq("organizer_id", user.id).order("event_date", { ascending: true });
  const organizerEventRows = (events ?? []) as OrganizerDashboardEventRow[];
  const ids = organizerEventRows.map((event) => event.id);
  const { data: registrations } = ids.length ? await supabase.from("event_registrations").select("event_id, status, looking_for_teammates").in("event_id", ids) : { data: [] as { event_id: string; status: string; looking_for_teammates: boolean }[] };
  const eventCounts = new Map<string, { registrations: number; interested: number }>();
  for (const registration of registrations ?? []) {
    if (registration.status !== "registered") continue;
    const count = eventCounts.get(registration.event_id) ?? { registrations: 0, interested: 0 };
    count.registrations += 1;
    if (registration.looking_for_teammates) count.interested += 1;
    eventCounts.set(registration.event_id, count);
  }
  return (
    <div className="page-shell wide">
      <PageHeading eyebrow="Organizer workspace" title={`Welcome, ${profile.org_name ?? profile.full_name}`} description="Your campus events, registrations, and teammate-interest totals." action={<Link href="/events" className="btn btn-primary"><CalendarDays size={14} /> Manage events</Link>} />
      <section className="section">
        <SectionHeading title="My events" note={`${organizerEventRows.length} events`} />
        {organizerEventRows.length ? <div className="list">{organizerEventRows.map((event) => {
          const count = eventCounts.get(event.id) ?? { registrations: 0, interested: 0 };
          return <div className="list-row" key={event.id}>
            <div className="list-row-main"><h3 className="row-title"><Link href={`/events/${event.id}`}>{event.title}</Link></h3><div className="meta-line"><span><CalendarDays size={13} />{formatDate(event.event_date, true)}</span><StatusTag tone={event.status === "registration_open" ? "accent" : "neutral"}>{eventStatusLabel(event.status)}</StatusTag></div></div>
            <div className="list-row-actions"><span className="meta-item"><Users size={14} />{count.registrations} registered</span><span className="meta-item"><UserRoundPlus size={14} />{count.interested} seeking teammates</span><Link className="btn btn-small" href={`/events/${event.id}`}>Manage</Link></div>
          </div>;
        })}</div> : <EmptyState title="No events created yet">Create a campus event to make it visible to students.</EmptyState>}
      </section>
    </div>
  );
}
