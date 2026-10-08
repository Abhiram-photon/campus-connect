import Link from "next/link";
import { Shield, UserRound } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { EmptyState, Field, PageHeading, SectionHeading, StatusTag } from "@/components/ui";
import { blockUserAction, unblockUserAction, updateProfileAction } from "@/app/workspace-actions";
import { getWorkspaceContext } from "@/lib/workspace";
import { SKILL_CHOICES } from "@/lib/constants";
import type { Skill } from "@/lib/types";
import type { BasicProfileRow, CampusProfileSearchRow } from "@/lib/db-models";

type UserSkillRow = { skill_id: string };
type BlockRow = { blocked_id: string; created_at: string };

type Props = { searchParams: Promise<{ q?: string }> };

export default async function SettingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user, profile } = await getWorkspaceContext();
  const [{ data: skills }, { data: selectedSkills }, { data: blocks }] = await Promise.all([
    supabase.from("skills").select("id, name").order("name"),
    supabase.from("user_skills").select("skill_id").eq("user_id", user.id),
    supabase.from("user_blocks").select("blocked_id, created_at").eq("blocker_id", user.id).order("created_at", { ascending: false }),
  ]);
  const selectedSkillIds = new Set((selectedSkills ?? []).map((row: UserSkillRow) => row.skill_id));
  const blockedIds = (blocks ?? []).map((row: BlockRow) => row.blocked_id);
  const { data: blockedProfiles } = blockedIds.length ? await supabase.from("profiles").select("id, full_name, role, department, org_name").in("id", blockedIds) : { data: [] as BasicProfileRow[] };
  const blockedById = new Map((blockedProfiles ?? []).map((person: BasicProfileRow) => [person.id, person]));
  const query = (params.q ?? "").trim();
  const { data: searchResults } = query.length >= 2 ? await supabase.rpc("search_campus_profiles", { p_query: query }) : { data: [] as CampusProfileSearchRow[] };
  const campusProfiles = (searchResults ?? []) as CampusProfileSearchRow[];

  return (
    <div className="page-shell">
      <PageHeading eyebrow="Account" title="Settings & safety" description="Edit your campus profile and control who can interact with you." />
      <div className="detail-layout">
        <main>
          <section className="content-panel">
            <SectionHeading title="Profile information" note={`${profile.role[0].toUpperCase()}${profile.role.slice(1)} account · role cannot be changed here`} />
            <ActionForm action={updateProfileAction} submitLabel="Save profile" pendingLabel="Saving…" className="form-grid">
              <Field label="Full name"><input className="control" name="full_name" minLength={2} maxLength={100} required defaultValue={profile.full_name} /></Field>
              <Field label="Campus role"><input className="control" value={profile.role} readOnly aria-readonly="true" /></Field>
              {profile.role === "student" || profile.role === "faculty" ? <>
                <Field label="Department / branch"><input className="control" name="department" maxLength={120} required defaultValue={profile.department ?? ""} /></Field>
                <Field label={profile.role === "student" ? "Year of study" : "Designation / title"}><input className="control" name="year_or_title" maxLength={80} required defaultValue={profile.year_or_title ?? ""} /></Field>
              </> : null}
              {profile.role === "organizer" ? <>
                <Field label="Club or organization"><input className="control" name="org_name" maxLength={140} required defaultValue={profile.org_name ?? ""} /></Field>
                <Field label="Organization information"><input className="control" name="organization_info" maxLength={1000} defaultValue={profile.organization_info ?? ""} /></Field>
              </> : null}
              {profile.role === "student" ? <fieldset className="form-wide" style={{ margin: 0, padding: 0, border: 0 }}>
                <legend className="field-label" style={{ marginBottom: 8 }}>Skills</legend>
                <p className="field-hint" style={{ marginTop: 0, marginBottom: 9 }}>Skills power exact event teammate overlap and visible connection signals.</p>
                <div className="checkbox-grid">{(skills ?? []).map((skill: Skill) => <label className="checkbox-row" key={skill.id}><input type="checkbox" name="skillIds" value={skill.id} defaultChecked={selectedSkillIds.has(skill.id)} /><span>{skill.name}</span></label>)}</div>
              </fieldset> : null}
              <div className="form-wide field-hint">Account email: {user.email ?? "Not available"} · Email and role are managed by authentication.</div>
            </ActionForm>
          </section>

          <section className="section">
            <SectionHeading title="Blocked users" note="Blocking is mutual in effect and hides direct conversations and discovery." />
            {blocks?.length ? <div className="list">{blocks.map((block: BlockRow) => {
              const person = blockedById.get(block.blocked_id);
              return <div className="list-row" key={block.blocked_id}>
                <div className="list-row-main"><h3 className="row-title">{person?.full_name ?? "Campus member"}</h3><p className="row-copy">{person?.department ?? person?.org_name ?? person?.role ?? "Campus profile"}</p></div>
                <ActionForm action={unblockUserAction} submitLabel="Unblock" pendingLabel="Updating…" buttonVariant="quiet" buttonClassName="btn-small" hideFeedback><input type="hidden" name="targetId" value={block.blocked_id} /></ActionForm>
              </div>;
            })}</div> : <EmptyState title="No blocked users">Users you block will be listed here.</EmptyState>}
          </section>
        </main>

        <aside className="content-panel">
          <SectionHeading title="Block a user" note="The other person will not receive a block notification." />
          <form method="get" action="/settings" className="search-inline">
            <input className="control" type="search" name="q" minLength={2} defaultValue={query} placeholder="Name, department, or club" aria-label="Search campus profiles" />
            <button className="btn" type="submit"><UserRound size={14} />Search</button>
          </form>
          {query.length >= 2 ? campusProfiles.length ? <div className="list" style={{ marginTop: 12 }}>{campusProfiles.map((person) => <div className="list-row" key={person.user_id}>
            <div className="list-row-main"><h3 className="row-title"><Link href={`/profile/${person.user_id}`}>{person.full_name}</Link></h3><p className="row-copy">{person.role}{person.department ? ` · ${person.department}` : person.org_name ? ` · ${person.org_name}` : ""}</p></div>
            <ActionForm action={blockUserAction} submitLabel="Block" pendingLabel="Blocking…" buttonVariant="danger" buttonClassName="btn-small" confirmMessage={`Block ${person.full_name}? This prevents direct interaction in both directions.`} hideFeedback><input type="hidden" name="targetId" value={person.user_id} /></ActionForm>
          </div>)}</div> : <EmptyState title="No matching profiles">Try another campus name or department.</EmptyState> : <div className="inline-note" style={{ marginTop: 14 }}><Shield size={14} style={{ verticalAlign: "-3px", marginRight: 5 }} />Search by name or department to block a campus profile.</div>}
          <div className="form-section">
            <h3 className="section-title">What blocking changes</h3>
            <ul className="safety-list"><li>Removes the profile from each other’s suggestions and teammate matching.</li><li>Prevents connection, partner, group invitation, and mentorship requests.</li><li>Revokes direct conversation access immediately.</li></ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
