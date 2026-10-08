import Link from "next/link";
import { CalendarDays, Users } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { EmptyState, Field, PageHeading, SectionHeading, StatusTag } from "@/components/ui";
import { createEventAction, registerForEventAction } from "@/app/workspace-actions";
import { eventStatusLabel, formatDate, isEventRegistrationOpen } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/workspace";
import type { BasicProfileRow, EventListRow, EventManagementRow, RegistrationInterestRow } from "@/lib/db-models";

export default async function EventsPage() {
  const { supabase, user, profile } = await getWorkspaceContext();

  if (profile.role === "student") {
    const { data: events } = await supabase.from("events").select("id, title, description, organizer_id, event_date, registration_deadline, status, created_at")
      .in("status", ["upcoming", "registration_open", "registration_closed"]).gt("event_date", new Date().toISOString())
      .order("event_date", { ascending: true });
    const eventRows = (events ?? []) as EventListRow[];
    const eventIds = eventRows.map((event) => event.id);
    const [{ data: registrations }, { data: organizers }] = await Promise.all([
      eventIds.length ? supabase.from("event_registrations").select("event_id, status, looking_for_teammates").eq("user_id", user.id).in("event_id", eventIds) : Promise.resolve({ data: [] }),
      eventIds.length ? supabase.from("profiles").select("id, full_name, org_name").in("id", Array.from(new Set(eventRows.map((event) => event.organizer_id)))) : Promise.resolve({ data: [] }),
    ]);
    const registrationRows = (registrations ?? []) as RegistrationInterestRow[];
    const organizerRows = (organizers ?? []) as BasicProfileRow[];
    const registrationMap = new Map<string, RegistrationInterestRow>(registrationRows.map((row) => [row.event_id, row]));
    const organizerMap = new Map<string, BasicProfileRow>(organizerRows.map((row) => [row.id, row]));

    return (
      <div className="page-shell wide">
        <PageHeading eyebrow="Campus calendar" title="Events" description="Browse campus opportunities. Registration and teammate discovery are separate choices." />
        <section className="section">
          {eventRows.length ? <div className="list">{eventRows.map((event) => {
            const registration = registrationMap.get(event.id);
            const active = registration?.status === "registered";
            const organizer = organizerMap.get(event.organizer_id);
            const registrationOpen = isEventRegistrationOpen(event);
            return <article className="list-row" key={event.id}>
              <div className="list-row-main">
                <h2 className="row-title"><Link href={`/events/${event.id}`}>{event.title}</Link></h2>
                <p className="row-copy">{event.description.length > 260 ? `${event.description.slice(0, 260).trim()}…` : event.description}</p>
                <div className="meta-line">
                  <span className="meta-item"><CalendarDays size={13} />{formatDate(event.event_date, true)}</span>
                  <span>Deadline {formatDate(event.registration_deadline, true)}</span>
                  <span>Organizer: {organizer?.org_name || organizer?.full_name || "Campus organizer"}</span>
                  <StatusTag tone={registrationOpen ? "accent" : "neutral"}>{registrationOpen ? "Registration open" : eventStatusLabel(event.status)}</StatusTag>
                </div>
              </div>
              <div className="list-row-actions">
                {active ? <>
                  <StatusTag tone="accent">Registered</StatusTag>
                  <Link href={`/events/${event.id}`} className="btn btn-small">{registration?.looking_for_teammates ? "View teammates" : "Find teammates"}</Link>
                </> : registrationOpen ? <ActionForm action={registerForEventAction} submitLabel="Register" pendingLabel="Registering…" buttonClassName="btn-small" hideFeedback><input type="hidden" name="eventId" value={event.id} /></ActionForm> : <Link href={`/events/${event.id}`} className="btn btn-small">Event details</Link>}
              </div>
            </article>;
          })}</div> : <EmptyState title="No upcoming events">Campus organizers have not published any upcoming events yet.</EmptyState>}
        </section>
        <div className="inline-note" style={{ marginTop: 22 }}>Showing interest is optional and only appears after you register. Skill overlap is calculated from the needs you specify for each event.</div>
      </div>
    );
  }

  if (profile.role === "faculty") {
    return <div className="page-shell"><PageHeading eyebrow="Campus events" title="Events are managed by organizers" description="Faculty accounts do not have event-management permissions. Your workspace is set up for groups, questions, and mentorship." /></div>;
  }

  const { data: events } = await supabase.from("events").select("id, title, description, event_date, registration_deadline, status, created_at")
    .eq("organizer_id", user.id).order("event_date", { ascending: true });
  const organizerEventRows = (events ?? []) as EventManagementRow[];
  const ids = organizerEventRows.map((event) => event.id);
  const { data: registrations } = ids.length ? await supabase.from("event_registrations").select("event_id, status, looking_for_teammates").in("event_id", ids) : { data: [] as RegistrationInterestRow[] };
  const registrationRows = (registrations ?? []) as RegistrationInterestRow[];
  const counts = new Map<string, { total: number; interested: number }>();
  for (const row of registrationRows) {
    if (row.status !== "registered") continue;
    const count = counts.get(row.event_id) ?? { total: 0, interested: 0 };
    count.total += 1;
    if (row.looking_for_teammates) count.interested += 1;
    counts.set(row.event_id, count);
  }

  return (
    <div className="page-shell wide">
      <PageHeading eyebrow="Organizer workspace" title="Manage campus events" description="Create and update event details, registration status, and attendee information." />
      <div className="detail-layout">
        <section>
          <SectionHeading title="Your events" note={`${organizerEventRows.length} total`} />
          {organizerEventRows.length ? <div className="list">{organizerEventRows.map((event) => {
            const count = counts.get(event.id) ?? { total: 0, interested: 0 };
            return <div className="list-row" key={event.id}>
              <div className="list-row-main"><h2 className="row-title"><Link href={`/events/${event.id}`}>{event.title}</Link></h2><p className="row-copy">{event.description.length > 170 ? `${event.description.slice(0, 170).trim()}…` : event.description}</p><div className="meta-line"><span>{formatDate(event.event_date, true)}</span><StatusTag tone={event.status === "registration_open" ? "accent" : "neutral"}>{eventStatusLabel(event.status)}</StatusTag></div></div>
              <div className="list-row-actions"><span className="meta-item"><Users size={13} />{count.total} registered</span><span className="meta-item">{count.interested} teammate interest</span><Link href={`/events/${event.id}`} className="btn btn-small">Manage</Link></div>
            </div>;
          })}</div> : <EmptyState title="No events created yet">Use the form to publish a campus event.</EmptyState>}
        </section>
        <aside className="content-panel">
          <SectionHeading title="Create an event" note="Students see this in the campus event list." />
          <ActionForm action={createEventAction} submitLabel="Create event" pendingLabel="Saving…" className="form-stack">
            <Field label="Event title"><input className="control" name="title" minLength={3} maxLength={140} required placeholder="Campus hackathon" /></Field>
            <Field label="Description"><textarea className="control" name="description" maxLength={6000} required placeholder="What is the event about?" /></Field>
            <div className="form-grid">
              <Field label="Event date and time"><input className="control" type="datetime-local" name="event_date" required /></Field>
              <Field label="Registration deadline"><input className="control" type="datetime-local" name="registration_deadline" required /></Field>
            </div>
            <Field label="Initial status"><select className="control" name="status" defaultValue="registration_open"><option value="registration_open">Registration open</option><option value="upcoming">Upcoming</option></select></Field>
          </ActionForm>
        </aside>
      </div>
    </div>
  );
}
