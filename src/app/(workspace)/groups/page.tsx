import Link from "next/link";
import { MessageSquare, Plus, Search, Users } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { EmptyState, Field, PageHeading, SectionHeading, StatusTag } from "@/components/ui";
import { createGroupAction, inviteGroupStudentAction, removeGroupStudentAction, respondGroupInviteAction } from "@/app/workspace-actions";
import { formatDate } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/workspace";
import type { BasicProfileRow, GroupMemberRow, GroupRow, StudentSearchRow } from "@/lib/db-models";

type GroupConversationRow = { id: string; group_id: string };

type Props = { searchParams: Promise<{ group?: string; q?: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function GroupsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user, profile } = await getWorkspaceContext();
  if (profile.role === "organizer") return <div className="page-shell"><PageHeading eyebrow="Campus groups" title="Groups are managed by faculty" description="Organizer accounts focus on campus events and do not receive faculty group permissions." /></div>;

  if (profile.role === "student") {
    const { data: memberships } = await supabase.from("group_members").select("group_id, role, status, invited_by, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
    const membershipRows = (memberships ?? []) as GroupMemberRow[];
    const groupIds = membershipRows.map((membership) => membership.group_id);
    const [{ data: groups }, { data: faculty }] = await Promise.all([
      groupIds.length ? supabase.from("groups").select("id, faculty_id, name, description, created_at").in("id", groupIds) : Promise.resolve({ data: [] }),
      groupIds.length ? supabase.from("groups").select("id, faculty_id").in("id", groupIds) : Promise.resolve({ data: [] }),
    ]);
    const facultyIds = Array.from(new Set(((faculty ?? []) as GroupRow[]).map((group) => group.faculty_id).filter((id): id is string => Boolean(id))));
    const { data: facultyProfiles } = facultyIds.length ? await supabase.from("profiles").select("id, full_name, department, year_or_title").in("id", facultyIds) : { data: [] as BasicProfileRow[] };
    const groupRows = (groups ?? []) as GroupRow[];
    const facultyRows = (facultyProfiles ?? []) as BasicProfileRow[];
    const groupMap = new Map<string, GroupRow>(groupRows.map((group) => [group.id, group]));
    const facultyMap = new Map<string, BasicProfileRow>(facultyRows.map((member) => [member.id, member]));
    const acceptedGroupIds = membershipRows.filter((row) => row.status === "accepted").map((row) => row.group_id);
    const { data: conversations } = acceptedGroupIds.length ? await supabase.from("conversations").select("id, group_id").eq("kind", "group").in("group_id", acceptedGroupIds) : { data: [] as GroupConversationRow[] };
    const conversationRows = (conversations ?? []) as GroupConversationRow[];
    const conversationByGroup = new Map<string, string>(conversationRows.map((conversation) => [conversation.group_id, conversation.id]));
    return (
      <div className="page-shell">
        <PageHeading eyebrow="Campus collaboration" title="Faculty groups" description="Join ongoing campus work when a faculty member invites you. Membership is always explicit." />
        {membershipRows.length ? <div className="list">{membershipRows.map((membership) => {
          const group = groupMap.get(membership.group_id);
          const facultyMember = group?.faculty_id ? facultyMap.get(group.faculty_id) : null;
          return <article className="list-row" key={membership.group_id}>
            <div className="list-row-main"><h2 className="row-title">{group?.name ?? "Faculty group"}</h2><p className="row-copy">{group?.description || "Faculty-created collaboration group."}</p><div className="meta-line"><span>{facultyMember?.full_name ?? "Faculty member"}{facultyMember?.department ? ` · ${facultyMember.department}` : ""}</span><span>Invited {formatDate(membership.created_at)}</span><StatusTag tone={membership.status === "accepted" ? "accent" : "neutral"}>{membership.status}</StatusTag></div></div>
            <div className="list-row-actions">{membership.status === "pending" ? <>
              <ActionForm action={respondGroupInviteAction} submitLabel="Accept" pendingLabel="Saving…" buttonClassName="btn-small" hideFeedback><input type="hidden" name="groupId" value={membership.group_id} /><input type="hidden" name="decision" value="accepted" /></ActionForm>
              <ActionForm action={respondGroupInviteAction} submitLabel="Decline" pendingLabel="Saving…" buttonVariant="quiet" buttonClassName="btn-small" hideFeedback><input type="hidden" name="groupId" value={membership.group_id} /><input type="hidden" name="decision" value="declined" /></ActionForm>
            </> : membership.status === "accepted" && conversationByGroup.get(membership.group_id) ? <Link className="btn btn-small" href={`/messages?c=${conversationByGroup.get(membership.group_id)}`}><MessageSquare size={13} />Open discussion</Link> : null}</div>
          </article>;
        })}</div> : <EmptyState title="You are not part of any groups yet">Faculty invitations will appear here. You can accept or decline each invitation.</EmptyState>}
      </div>
    );
  }

  const { data: groups } = await supabase.from("groups").select("id, name, description, created_at").eq("faculty_id", user.id).order("created_at", { ascending: false });
  const groupRows = (groups ?? []) as GroupRow[];
  const selectedGroupId = params.group && UUID_RE.test(params.group) && groupRows.some((group) => group.id === params.group) ? params.group : groupRows[0]?.id ?? null;
  const selectedGroup = groupRows.find((group) => group.id === selectedGroupId) ?? null;
  const [{ data: members }, { data: groupConversation }] = selectedGroupId ? await Promise.all([
    supabase.from("group_members").select("group_id, user_id, role, status, invited_by, created_at").eq("group_id", selectedGroupId).order("created_at", { ascending: true }),
    supabase.from("conversations").select("id").eq("kind", "group").eq("group_id", selectedGroupId).maybeSingle(),
  ]) : [{ data: [] as GroupMemberRow[] }, { data: null as { id: string } | null }];
  const memberRows = (members ?? []) as GroupMemberRow[];
  const studentIds = memberRows.map((member) => member.user_id);
  const { data: students } = studentIds.length ? await supabase.from("profiles").select("id, full_name, department, year_or_title").in("id", studentIds) : { data: [] as BasicProfileRow[] };
  const studentRows = (students ?? []) as BasicProfileRow[];
  const studentMap = new Map<string, BasicProfileRow>(studentRows.map((student) => [student.id, student]));
  const query = (params.q ?? "").trim();
  const { data: searchResults } = query.length >= 2 ? await supabase.rpc("search_students", { p_query: query }) : { data: [] as StudentSearchRow[] };
  const studentSearchRows = (searchResults ?? []) as StudentSearchRow[];
  const activeMembers = memberRows.filter((member) => member.status === "accepted").length;

  return (
    <div className="page-shell wide">
      <PageHeading eyebrow="Faculty workspace" title="Groups" description="Create an ongoing collaboration space, invite students, and manage accepted memberships." />
      <div className="detail-layout">
        <main>
          {groupRows.length ? <>
            <SectionHeading title="Your groups" note={`${groupRows.length} groups`} />
            <div className="list">{groupRows.map((group) => <Link className={`list-row group-list-item ${group.id === selectedGroupId ? "selected" : ""}`} href={`/groups?group=${group.id}`} key={group.id}>
              <div className="list-row-main"><h2 className="row-title">{group.name}</h2><p className="row-copy">{group.description || "Faculty-created collaboration group."}</p></div><span className="meta-item"><Users size={13} />{group.id === selectedGroupId ? activeMembers : ""}</span>
            </Link>)}</div>
          </> : <EmptyState title="No faculty groups yet">Create a group to invite students into an ongoing campus collaboration.</EmptyState>}
          {selectedGroup ? <section className="section">
            <div className="section-head"><div><h2 className="section-title">{selectedGroup.name}</h2><div className="section-note">{activeMembers} accepted members</div></div>{groupConversation?.id ? <Link className="btn btn-small" href={`/messages?c=${groupConversation.id}`}><MessageSquare size={13} />Open discussion</Link> : null}</div>
            <div className="table-wrap"><table><thead><tr><th>Student</th><th>Department</th><th>Status</th><th>Action</th></tr></thead><tbody>
              {memberRows.map((member) => {
                const student = studentMap.get(member.user_id);
                return <tr key={member.user_id}>
                  <td>{student?.full_name ?? "Campus student"}</td><td>{student?.department ?? "—"}{student?.year_or_title ? ` · ${student.year_or_title}` : ""}</td><td><StatusTag tone={member.status === "accepted" ? "accent" : "neutral"}>{member.role === "admin" ? "Admin" : member.status}</StatusTag></td>
                  <td>{member.role === "member" && member.status === "accepted" ? <ActionForm action={removeGroupStudentAction} submitLabel="Remove" pendingLabel="Removing…" buttonVariant="quiet" buttonClassName="btn-small" confirmMessage="Remove this student from the group?" hideFeedback><input type="hidden" name="groupId" value={selectedGroup.id} /><input type="hidden" name="studentId" value={member.user_id} /></ActionForm> : "—"}</td>
                </tr>;
              })}
              {!memberRows.length ? <tr><td colSpan={4}>No students have been invited yet.</td></tr> : null}
            </tbody></table></div>
            <div className="section" style={{ marginTop: 23 }}>
              <SectionHeading title="Invite a student" note="Search campus profiles; the student must accept the invitation." />
              <form method="get" action="/groups" className="search-inline">
                <input type="hidden" name="group" value={selectedGroup.id} />
                <input className="control" type="search" name="q" minLength={2} defaultValue={query} placeholder="Name or department" aria-label="Search students" />
                <button className="btn" type="submit"><Search size={14} />Search</button>
              </form>
              {query.length >= 2 ? studentSearchRows.length ? <div className="list" style={{ marginTop: 12 }}>{studentSearchRows.map((student) => {
                const existing = memberRows.find((member) => member.user_id === student.user_id);
                return <div className="list-row" key={student.user_id}><div className="list-row-main"><h3 className="row-title">{student.full_name}</h3><p className="row-copy">{student.department ?? "Student"}{student.year_or_title ? ` · ${student.year_or_title}` : ""}</p></div>
                  {existing ? <StatusTag>{existing.status === "accepted" ? "Already a member" : existing.status === "pending" ? "Invitation pending" : "Previously declined"}</StatusTag> : <ActionForm action={inviteGroupStudentAction} submitLabel="Invite" pendingLabel="Sending…" buttonClassName="btn-small" hideFeedback><input type="hidden" name="groupId" value={selectedGroup.id} /><input type="hidden" name="studentId" value={student.user_id} /></ActionForm>}
                </div>;
              })}</div> : <EmptyState title="No students found">Try a different name or department.</EmptyState> : null}
            </div>
          </section> : null}
        </main>
        <aside className="content-panel">
          <SectionHeading title="Create a group" note="You become the group administrator." />
          <ActionForm action={createGroupAction} submitLabel="Create group" pendingLabel="Creating…" className="form-stack">
            <Field label="Group name"><input className="control" name="name" minLength={3} maxLength={120} required placeholder="Applied ML reading group" /></Field>
            <Field label="Description"><textarea className="control" name="description" maxLength={3000} placeholder="What will members work on together?" /></Field>
          </ActionForm>
          <div className="inline-note" style={{ marginTop: 17 }}>Invited students appear as pending until they accept. Group messages open only for accepted members.</div>
        </aside>
      </div>
    </div>
  );
}
