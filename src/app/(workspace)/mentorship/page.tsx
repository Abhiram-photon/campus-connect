import Link from "next/link";
import { ArrowUpRight, CalendarDays, GraduationCap } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { EmptyState, Field, PageHeading, SectionHeading, StatusTag } from "@/components/ui";
import {
  acceptAllMentorshipAction, cancelMentorshipAction, createMentorshipSessionAction,
  respondMentorshipAction, requestMentorshipAction, updateMentorshipSessionAction,
} from "@/app/workspace-actions";
import { formatDate } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/workspace";
import type { BasicProfileRow, MentorshipAvailabilityRow, MentorshipRequestRow, MentorshipSessionRow } from "@/lib/db-models";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Props = { searchParams: Promise<{ session?: string }> };
function istInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

export default async function MentorshipPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user, profile } = await getWorkspaceContext();
  if (profile.role === "organizer") return <div className="page-shell"><PageHeading eyebrow="Faculty mentoring" title="Mentorship is a faculty capability" description="Organizer accounts focus on event management. Faculty publish mentorship sessions and students request a place." /></div>;

  if (profile.role === "student") {
    const [{ data: sessions }, { data: requests }, { data: availability }] = await Promise.all([
      supabase.from("mentorship_sessions").select("id, faculty_id, title, description, session_date, capacity, status").eq("status", "published").gt("session_date", new Date().toISOString()).order("session_date"),
      supabase.from("mentorship_requests").select("id, session_id, status, created_at").eq("student_id", user.id).order("created_at", { ascending: false }),
      supabase.rpc("mentorship_available_slots"),
    ]);
    const sessionRecords = (sessions ?? []) as MentorshipSessionRow[];
    const requestRecords = (requests ?? []) as MentorshipRequestRow[];
    const availabilityRecords = (availability ?? []) as MentorshipAvailabilityRow[];
    const sessionIds = Array.from(new Set([...sessionRecords.map((session) => session.id), ...requestRecords.map((request) => request.session_id)]));
    const facultyIds = Array.from(new Set(sessionRecords.map((session) => session.faculty_id).filter((id): id is string => Boolean(id))));
    const [{ data: sessionRows }, { data: faculty }] = await Promise.all([
      sessionIds.length ? supabase.from("mentorship_sessions").select("id, title, description, session_date, capacity, status").in("id", sessionIds) : Promise.resolve({ data: [] }),
      facultyIds.length ? supabase.from("profiles").select("id, full_name, department, year_or_title").in("id", facultyIds) : Promise.resolve({ data: [] }),
    ]);
    const sessionMap = new Map<string, MentorshipSessionRow>(((sessionRows ?? []) as MentorshipSessionRow[]).map((session) => [session.id, session]));
    const facultyMap = new Map<string, BasicProfileRow>(((faculty ?? []) as BasicProfileRow[]).map((member) => [member.id, member]));
    const availabilityMap = new Map<string, MentorshipAvailabilityRow>(availabilityRecords.map((row) => [row.session_id, row]));
    const requestMap = new Map<string, MentorshipRequestRow>(requestRecords.map((request) => [request.session_id, request]));
    const pendingOrAccepted = requestRecords.filter((request) => request.status === "pending" || request.status === "accepted");

    return (
      <div className="page-shell wide">
        <PageHeading eyebrow="Faculty mentoring" title="Mentorship" description="Request a place in a faculty-published session. Faculty approval is required, and capacity is enforced in the database." />
        <div className="detail-layout">
          <main>
            <SectionHeading title="Available sessions" note="Published sessions with future dates." />
            {sessionRecords.length ? <div className="list">{sessionRecords.map((session) => {
              const facultyMember = session.faculty_id ? facultyMap.get(session.faculty_id) : undefined;
              const slots = availabilityMap.get(session.id);
              const request = requestMap.get(session.id);
              const activeRequest = request && (request.status === "pending" || request.status === "accepted");
              return <article className="list-row" key={session.id}>
                <div className="list-row-main">
                  <h2 className="row-title">{session.title}</h2>
                  <p className="row-copy">{session.description}</p>
                  <div className="meta-line"><span className="meta-item"><CalendarDays size={13} />{formatDate(session.session_date, true)}</span><span>{facultyMember?.full_name ?? "Faculty member"}{facultyMember?.department ? ` · ${facultyMember.department}` : ""}</span><span>{slots?.remaining_capacity ?? session.capacity} place{Number(slots?.remaining_capacity ?? session.capacity) === 1 ? "" : "s"} available</span></div>
                </div>
                <div className="list-row-actions">
                  {activeRequest ? <><StatusTag tone={request.status === "accepted" ? "accent" : "neutral"}>{request.status}</StatusTag><ActionForm action={cancelMentorshipAction} submitLabel="Cancel request" pendingLabel="Cancelling…" buttonVariant="quiet" buttonClassName="btn-small" confirmMessage="Cancel this mentorship request?" hideFeedback><input type="hidden" name="requestId" value={request.id} /></ActionForm></> : Number(slots?.remaining_capacity ?? session.capacity) > 0 ? <ActionForm action={requestMentorshipAction} submitLabel={request?.status === "declined" || request?.status === "cancelled" ? "Request again" : "Request a place"} pendingLabel="Requesting…" buttonClassName="btn-small" hideFeedback><input type="hidden" name="sessionId" value={session.id} /></ActionForm> : <StatusTag>Full</StatusTag>}
                </div>
              </article>;
            })}</div> : <EmptyState title="No mentorship sessions available">Faculty have not published any upcoming sessions yet.</EmptyState>}
          </main>
          <aside>
            <SectionHeading title="Your requests" note={`${pendingOrAccepted.length} active`} />
            {requestRecords.length ? <div className="list">{requestRecords.map((request) => {
              const session = sessionMap.get(request.session_id);
              return <div className="list-row" key={request.id}><div className="list-row-main"><h3 className="row-title">{session?.title ?? "Mentorship session"}</h3><p className="row-copy">{session ? formatDate(session.session_date, true) : "Session no longer available"}</p></div><StatusTag tone={request.status === "accepted" ? "accent" : "neutral"}>{request.status}</StatusTag></div>;
            })}</div> : <EmptyState title="No mentorship requests">Your pending and accepted requests will appear here.</EmptyState>}
            <div className="inline-note" style={{ marginTop: 16 }}>A confirmed mentorship request opens a private conversation with the faculty member.</div>
          </aside>
        </div>
      </div>
    );
  }

  const { data: sessions } = await supabase.from("mentorship_sessions").select("id, title, description, session_date, capacity, status, created_at").eq("faculty_id", user.id).order("session_date", { ascending: true });
  const sessionRecords = (sessions ?? []) as MentorshipSessionRow[];
  const selectedSessionId = params.session && UUID_RE.test(params.session) && sessionRecords.some((session) => session.id === params.session) ? params.session : sessionRecords[0]?.id ?? null;
  const selectedSession = sessionRecords.find((session) => session.id === selectedSessionId) ?? null;
  const { data: requests } = selectedSessionId ? await supabase.from("mentorship_requests").select("id, session_id, student_id, status, created_at").eq("session_id", selectedSessionId).order("created_at", { ascending: true }) : { data: [] as MentorshipRequestRow[] };
  const requestRecords = (requests ?? []) as MentorshipRequestRow[];
  const studentIds = requestRecords.map((request) => request.student_id).filter((id): id is string => Boolean(id));
  const { data: students } = studentIds.length ? await supabase.from("profiles").select("id, full_name, department, year_or_title").in("id", studentIds) : { data: [] as BasicProfileRow[] };
  const studentMap = new Map<string, BasicProfileRow>(((students ?? []) as BasicProfileRow[]).map((student) => [student.id, student]));
  const acceptedCount = requestRecords.filter((request) => request.status === "accepted").length;
  const pendingCount = requestRecords.filter((request) => request.status === "pending").length;

  return (
    <div className="page-shell wide">
      <PageHeading eyebrow="Faculty mentoring" title="Mentorship sessions" description="Publish mentoring opportunities, review requests, and accept students up to the session capacity." />
      <div className="detail-layout">
        <main>
          {sessionRecords.length ? <>
            <SectionHeading title="Your sessions" note={`${sessionRecords.length} total`} />
            <div className="list">{sessionRecords.map((session) => <Link className={`list-row session-list-item ${session.id === selectedSessionId ? "selected" : ""}`} href={`/mentorship?session=${session.id}`} key={session.id}>
              <div className="list-row-main"><h2 className="row-title">{session.title}</h2><p className="row-copy">{formatDate(session.session_date, true)}</p></div><StatusTag tone={session.status === "published" ? "accent" : "neutral"}>{session.status}</StatusTag>
            </Link>)}</div>
          </> : <EmptyState title="No mentorship sessions yet">Create a draft or publish a future mentorship session.</EmptyState>}

          {selectedSession ? <section className="section">
            <div className="section-head"><div><h2 className="section-title">{selectedSession.title}</h2><div className="section-note">{formatDate(selectedSession.session_date, true)} · {acceptedCount} accepted of {selectedSession.capacity} places · {pendingCount} pending</div></div>
              {pendingCount > 0 && acceptedCount < selectedSession.capacity ? <ActionForm action={acceptAllMentorshipAction} submitLabel="Accept all eligible" pendingLabel="Accepting…" buttonClassName="btn-small" hideFeedback><input type="hidden" name="sessionId" value={selectedSession.id} /></ActionForm> : null}
            </div>
            {requestRecords.length ? <div className="table-wrap"><table><thead><tr><th>Student</th><th>Department / year</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead><tbody>
              {requestRecords.map((request) => {
                const student = request.student_id ? studentMap.get(request.student_id) : undefined;
                return <tr key={request.id}><td><Link className="text-link" href={`/profile/${request.student_id}`}>{student?.full_name ?? "Campus student"}</Link></td><td>{student?.department ?? "—"}{student?.year_or_title ? ` · ${student.year_or_title}` : ""}</td><td>{formatDate(request.created_at)}</td><td><StatusTag tone={request.status === "accepted" ? "accent" : "neutral"}>{request.status}</StatusTag></td><td>{request.status === "pending" ? <div className="list-row-actions"><ActionForm action={respondMentorshipAction} submitLabel="Accept" pendingLabel="Saving…" buttonClassName="btn-small"><input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="decision" value="accepted" /></ActionForm><ActionForm action={respondMentorshipAction} submitLabel="Decline" pendingLabel="Saving…" buttonVariant="quiet" buttonClassName="btn-small"><input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="decision" value="declined" /></ActionForm></div> : request.status === "accepted" ? <Link className="text-link" href={`/messages?with=${request.student_id}`}>Message</Link> : "—"}</td></tr>;
              })}
            </tbody></table></div> : <EmptyState title="No requests yet">Student requests will appear when this session is published.</EmptyState>}
            <div className="section" style={{ marginTop: 24 }}>
              <SectionHeading title="Edit session" />
              <ActionForm action={updateMentorshipSessionAction} submitLabel="Save session" pendingLabel="Saving…" className="form-grid">
                <input type="hidden" name="sessionId" value={selectedSession.id} />
                <Field label="Title"><input className="control" name="title" minLength={3} maxLength={160} required defaultValue={selectedSession.title} /></Field>
                <Field label="Date and time"><input className="control" type="datetime-local" name="session_date" required defaultValue={istInput(selectedSession.session_date)} /></Field>
                <Field label="Description" className="form-wide"><textarea className="control" name="description" required maxLength={6000} defaultValue={selectedSession.description} /></Field>
                <Field label="Capacity"><input className="control" type="number" name="capacity" min={1} max={500} step={1} required defaultValue={selectedSession.capacity} /></Field>
                <Field label="Status"><select className="control" name="status" defaultValue={selectedSession.status}><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option><option value="completed">Completed</option></select></Field>
              </ActionForm>
            </div>
          </section> : null}
        </main>
        <aside className="content-panel">
          <SectionHeading title="Publish a session" note="A defined mentoring opportunity with a date and capacity." />
          <ActionForm action={createMentorshipSessionAction} submitLabel="Create session" pendingLabel="Saving…" className="form-stack">
            <Field label="Title"><input className="control" name="title" minLength={3} maxLength={160} required placeholder="Research methods office hours" /></Field>
            <Field label="Description"><textarea className="control" name="description" maxLength={6000} required placeholder="Describe the topic and what students can expect." /></Field>
            <Field label="Date and time"><input className="control" type="datetime-local" name="session_date" required /></Field>
            <Field label="Capacity"><input className="control" type="number" name="capacity" min={1} max={500} step={1} required defaultValue={5} /></Field>
            <Field label="Status"><select className="control" name="status" defaultValue="published"><option value="published">Published</option><option value="draft">Draft</option></select></Field>
          </ActionForm>
          <div className="inline-note" style={{ marginTop: 17 }}>Accept All Eligible processes pending requests in order until capacity is reached. Remaining requests stay pending.</div>
        </aside>
      </div>
    </div>
  );
}
