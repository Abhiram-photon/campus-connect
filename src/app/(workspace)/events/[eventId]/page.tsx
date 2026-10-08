import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock3, Users } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { InterestDialog } from "@/components/interest-dialog";
import { EmptyState, Field, PageHeading, SectionHeading, StatusTag } from "@/components/ui";
import {
  cancelEventRegistrationAction, createEventAction, registerForEventAction,
  sendPartnerRequestAction, updateEventAction,
} from "@/app/workspace-actions";
import { eventStatusLabel, formatDate, isEventRegistrationOpen } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/workspace";
import type { Skill, CampusEvent } from "@/lib/types";
import type { BasicProfileRow, EventAttendeeRegistrationRow, TeammateMatchRow } from "@/lib/db-models";

type Props = { params: Promise<{ eventId: string }> };

function istInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

export default async function EventDetailPage({ params }: Props) {
  const { eventId } = await params;
  const { supabase, user, profile } = await getWorkspaceContext();
  const { data: event } = await supabase.from("events").select("id, title, description, organizer_id, event_date, registration_deadline, status, created_at, updated_at").eq("id", eventId).maybeSingle();
  if (!event) notFound();

  const [{ data: organizer }, { data: allSkills }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, org_name").eq("id", event.organizer_id).maybeSingle(),
    supabase.from("skills").select("id, name").order("name"),
  ]);

  if (profile.role === "organizer") {
    if (event.organizer_id !== user.id) notFound();
    const { data: registrations } = await supabase.from("event_registrations").select("id, user_id, status, looking_for_teammates, skills_offered, skills_needed, created_at").eq("event_id", eventId).order("created_at", { ascending: false });
    const registrationRows = (registrations ?? []) as EventAttendeeRegistrationRow[];
    const attendeeIds = Array.from(new Set(registrationRows.map((row) => row.user_id)));
    const { data: attendees } = attendeeIds.length ? await supabase.from("profiles").select("id, full_name, department, year_or_title").in("id", attendeeIds) : { data: [] as BasicProfileRow[] };
    const attendeeMap = new Map((attendees ?? []).map((attendee: BasicProfileRow) => [attendee.id, attendee]));
    const active = registrationRows.filter((row) => row.status === "registered");
    const interested = active.filter((row) => row.looking_for_teammates).length;
    return (
      <div className="page-shell wide">
        <Link className="text-link" href="/events"><ArrowLeft size={13} style={{ verticalAlign: "-2px" }} /> Back to events</Link>
        <div style={{ marginTop: 17 }}>
          <PageHeading eyebrow="Event management" title={event.title} description={`Created for ${profile.org_name ?? profile.full_name}. Update event details or review student registrations.`} />
        </div>
        <div className="detail-layout">
          <section>
            <div className="content-panel" style={{ marginBottom: 23 }}>
              <SectionHeading title="Event details" />
              <div className="meta-line" style={{ marginBottom: 11 }}><span className="meta-item"><CalendarDays size={13} />{formatDate(event.event_date, true)}</span><span className="meta-item"><Clock3 size={13} />Deadline {formatDate(event.registration_deadline, true)}</span><StatusTag tone={event.status === "registration_open" ? "accent" : "neutral"}>{eventStatusLabel(event.status)}</StatusTag></div>
              <p className="row-copy" style={{ whiteSpace: "pre-wrap" }}>{event.description}</p>
            </div>
            <SectionHeading title="Registrations" note={`${active.length} registered · ${interested} looking for teammates`} />
            {registrationRows.length ? <div className="table-wrap"><table><thead><tr><th>Student</th><th>Department</th><th>Status</th><th>Teammates</th></tr></thead><tbody>
              {registrationRows.map((row) => {
                const attendee = attendeeMap.get(row.user_id);
                return <tr key={row.id}><td><Link className="text-link" href={`/profile/${row.user_id}`}>{attendee?.full_name ?? "Campus member"}</Link></td><td>{attendee?.department ?? "—"}</td><td>{row.status}</td><td>{row.status === "registered" && row.looking_for_teammates ? "Interested" : "—"}</td></tr>;
              })}
            </tbody></table></div> : <EmptyState title="No registrations yet">Student registrations will appear here.</EmptyState>}
          </section>
          <aside className="content-panel">
            <SectionHeading title="Edit event" />
            <ActionForm action={updateEventAction} submitLabel="Save changes" pendingLabel="Saving…" className="form-stack">
              <input type="hidden" name="eventId" value={event.id} />
              <Field label="Event title"><input className="control" name="title" required minLength={3} maxLength={140} defaultValue={event.title} /></Field>
              <Field label="Description"><textarea className="control" name="description" required maxLength={6000} defaultValue={event.description} /></Field>
              <Field label="Event date and time"><input className="control" type="datetime-local" name="event_date" required defaultValue={istInput(event.event_date)} /></Field>
              <Field label="Registration deadline"><input className="control" type="datetime-local" name="registration_deadline" required defaultValue={istInput(event.registration_deadline)} /></Field>
              <Field label="Status"><select className="control" name="status" defaultValue={event.status}><option value="upcoming">Upcoming</option><option value="registration_open">Registration open</option><option value="registration_closed">Registration closed</option><option value="completed">Completed</option></select></Field>
            </ActionForm>
          </aside>
        </div>
      </div>
    );
  }

  const isStudent = profile.role === "student";
  const { data: registration } = isStudent
    ? await supabase.from("event_registrations").select("id, status, looking_for_teammates, skills_offered, skills_needed").eq("event_id", eventId).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const activeRegistration = registration?.status === "registered";
  const eventIsOpen = isEventRegistrationOpen(event as CampusEvent);

  let profileSkills: Skill[] = [];
  if (isStudent) {
    const { data: userSkills } = await supabase.from("user_skills").select("skill_id").eq("user_id", user.id);
    const currentSkillIds = (userSkills ?? []).map((row: { skill_id: string }) => row.skill_id);
    profileSkills = ((allSkills ?? []) as Skill[]).filter((skill) => currentSkillIds.includes(skill.id));
  }

  const matchesResult = isStudent && activeRegistration && registration?.looking_for_teammates
    ? await supabase.rpc("find_event_teammates", { p_event_id: eventId })
    : { data: [] as BasicProfileRow[], error: null };
  const matches = (matchesResult.data ?? []) as TeammateMatchRow[];

  return (
    <div className="page-shell wide">
      <Link className="text-link" href="/events"><ArrowLeft size={13} style={{ verticalAlign: "-2px" }} /> Back to events</Link>
      <div style={{ marginTop: 17 }}>
        <PageHeading eyebrow="Campus event" title={event.title} description="Event registration and teammate interest are separate choices. Matching is based on exact skill overlap among registered students." />
      </div>
      <div className="detail-layout">
        <main>
          <section className="cardless-panel">
            <div className="meta-line" style={{ marginTop: 0 }}>
              <span className="meta-item"><CalendarDays size={13} />{formatDate(event.event_date, true)}</span>
              <span className="meta-item"><Clock3 size={13} />Registration deadline {formatDate(event.registration_deadline, true)}</span>
              <StatusTag tone={eventIsOpen ? "accent" : "neutral"}>{eventStatusLabel(event.status)}</StatusTag>
            </div>
            <p className="row-copy" style={{ marginTop: 15, whiteSpace: "pre-wrap", maxWidth: 820 }}>{event.description}</p>
            <div className="meta-line"><span>Organizer: {organizer?.org_name || organizer?.full_name || "Campus organizer"}</span></div>
          </section>

          {isStudent ? <section className="section">
            <SectionHeading title="Your participation" />
            <div className="content-panel">
              {!activeRegistration ? <>
                <p className="row-copy" style={{ marginTop: 0 }}>{registration?.status === "cancelled" ? "Your previous registration was cancelled." : "Register for this event before showing interest in finding teammates."}</p>
                {eventIsOpen ? <ActionForm action={registerForEventAction} submitLabel="Register for event" pendingLabel="Registering…">
                  <input type="hidden" name="eventId" value={eventId} />
                </ActionForm> : <StatusTag>{event.status === "registration_open" ? "Registration deadline passed" : eventStatusLabel(event.status)}</StatusTag>}
              </> : <div className="form-stack">
                <div className="list-row" style={{ paddingTop: 0 }}><div className="list-row-main"><div className="row-title">You are registered</div><p className="row-copy">You can participate without looking for a team, or separately share your collaboration needs.</p></div><ActionForm action={cancelEventRegistrationAction} submitLabel="Cancel registration" pendingLabel="Cancelling…" buttonVariant="quiet" buttonClassName="btn-small" confirmMessage="Cancel your registration for this event?"><input type="hidden" name="eventId" value={eventId} /></ActionForm></div>
                <InterestDialog
                  eventId={eventId}
                  profileSkills={profileSkills}
                  allSkills={(allSkills ?? []) as Skill[]}
                  offeredIds={(registration?.skills_offered ?? []) as string[]}
                  neededIds={(registration?.skills_needed ?? []) as string[]}
                  alreadyInterested={Boolean(registration?.looking_for_teammates)}
                />
                {registration?.looking_for_teammates ? <div className="section" style={{ marginTop: 5 }}>
                  <SectionHeading title="Teammates" note="Exact overlap between your requested skills and other students’ event-offered skills." />
                  {matches.length ? <div className="list">{matches.map((person: TeammateMatchRow) => <article className="list-row" key={person.user_id}>
                    <div className="list-row-main">
                      <h3 className="row-title"><Link href={`/profile/${person.user_id}`}>{person.full_name}</Link></h3>
                      <p className="row-copy">{person.department ?? "Student"}{person.year_or_title ? ` · ${person.year_or_title}` : ""}</p>
                      <div className="tag-list">{(person.offered_skills ?? []).map((skill: string) => <StatusTag key={skill}>{skill}</StatusTag>)}</div>
                      <div className="meta-line"><span>{person.matched_count} of {person.required_count} requested skill{person.required_count === 1 ? "" : "s"} overlap ({person.overlap_percent}%)</span><span>Matched: {(person.matched_skills ?? []).join(", ")}</span></div>
                    </div>
                    <ActionForm action={sendPartnerRequestAction} submitLabel="Send partner request" pendingLabel="Sending…" buttonClassName="btn-small" hideFeedback>
                      <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="receiverId" value={person.user_id} />
                    </ActionForm>
                  </article>)}</div> : <EmptyState title="No skill overlap found yet">Your preferences are saved. New interested registrations will appear here when their offered skills match what you need.</EmptyState>}
                </div> : null}
              </div>}
            </div>
          </section> : <section className="section"><div className="inline-note">Event participation is available to student accounts. This account can view event information but cannot register or send partner requests.</div></section>}
        </main>
        <aside>
          <SectionHeading title="Event information" />
          <div className="list">
            <div className="list-row"><div className="list-row-main"><div className="field-label">Event date</div><div className="row-copy">{formatDate(event.event_date, true)}</div></div></div>
            <div className="list-row"><div className="list-row-main"><div className="field-label">Registration closes</div><div className="row-copy">{formatDate(event.registration_deadline, true)}</div></div></div>
            <div className="list-row"><div className="list-row-main"><div className="field-label">Organized by</div><div className="row-copy">{organizer?.org_name || organizer?.full_name || "Campus organizer"}</div></div></div>
          </div>
          <p className="field-hint" style={{ marginTop: 15 }}>Teammate matching is relational and explainable. There are no compatibility scores or automated recommendations.</p>
        </aside>
      </div>
    </div>
  );
}
