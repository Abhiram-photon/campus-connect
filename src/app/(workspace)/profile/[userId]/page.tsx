import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Shield } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { EmptyState, PageHeading, SectionHeading, StatusTag } from "@/components/ui";
import { blockUserAction, respondConnectionRequestAction, sendConnectionRequestAction, unblockUserAction } from "@/app/workspace-actions";
import { initials } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/workspace";
import type { Profile, Skill } from "@/lib/types";
import type { ConnectionRow } from "@/lib/db-models";

type UserSkillRow = { skill_id: string };
type PartnerRequestIdRow = { id: string };

type Props = { params: Promise<{ userId: string }> };

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params;
  const { supabase, user, profile: viewer } = await getWorkspaceContext();
  if (userId === user.id) return <div className="page-shell"><PageHeading eyebrow="Campus profile" title="Your profile" description="Update your own campus profile and skills from Settings & safety." action={<Link className="btn" href="/settings">Open settings</Link>} /></div>;
  const { data: profileData } = await supabase.from("profiles").select("id, full_name, role, avatar_url, department, year_or_title, org_name, organization_info, created_at").eq("id", userId).maybeSingle();
  const profile = profileData as Profile | null;
  if (!profile) notFound();

  const { data: ownBlock } = await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id).eq("blocked_id", userId).maybeSingle();
  const isBlockedByMe = Boolean(ownBlock);
  const { data: skillRows } = isBlockedByMe ? { data: [] as UserSkillRow[] } : await supabase.from("user_skills").select("skill_id").eq("user_id", userId);
  const skillIds = (skillRows ?? []).map((row: UserSkillRow) => row.skill_id);
  const { data: skills } = skillIds.length ? await supabase.from("skills").select("id, name").in("id", skillIds).order("name") : { data: [] as Skill[] };
  const skillRecords = (skills ?? []) as Skill[];
  const canConnect = viewer.role === "student" && profile.role === "student";
  const { data: connection } = canConnect ? await supabase.from("connections").select("id, user_a_id, user_b_id, requested_by, status, created_at").eq("user_a_id", user.id < userId ? user.id : userId).eq("user_b_id", user.id < userId ? userId : user.id).maybeSingle() : { data: null as ConnectionRow | null };
  const connectionRecord = connection as ConnectionRow | null;
  const { data: acceptedPartner } = canConnect ? await supabase.from("partner_requests").select("id").eq("status", "accepted").or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`).limit(1).maybeSingle() : { data: null as PartnerRequestIdRow | null };
  const isIncoming = connectionRecord?.status === "pending" && connectionRecord.requested_by !== user.id;
  const canMessage = connectionRecord?.status === "accepted" || Boolean(acceptedPartner);
  const details = [profile.role, profile.department, profile.year_or_title].filter(Boolean).join(" · ");

  return (
    <div className="page-shell">
      <Link className="text-link" href="/connections"><ArrowLeft size={13} style={{ verticalAlign: "-2px" }} /> Back</Link>
      <div className="profile-heading" style={{ marginTop: 18, paddingBottom: 18, borderBottom: "1px solid var(--line)" }}>
        <div className="avatar-large">{initials(profile.full_name)}</div>
        <div style={{ flex: 1 }}>
          <p className="page-eyebrow">Campus profile</p>
          <h1 className="page-title" style={{ fontSize: 25 }}>{profile.full_name}</h1>
          <p className="page-description" style={{ marginTop: 4 }}>{details || profile.org_name || "Campus member"}</p>
          {profile.role === "organizer" && profile.org_name ? <p className="row-copy">{profile.org_name}</p> : null}
        </div>
        {!isBlockedByMe ? <div className="list-row-actions">
          {canMessage ? <Link className="btn" href={`/messages?with=${userId}`}><MessageSquare size={14} />Message</Link> : null}
          {canConnect && (!connectionRecord || connectionRecord.status === "declined") ? <ActionForm action={sendConnectionRequestAction} submitLabel="Connect" pendingLabel="Sending…" hideFeedback><input type="hidden" name="targetId" value={userId} /></ActionForm> : null}
          {isIncoming && connectionRecord ? <ActionForm action={respondConnectionRequestAction} submitLabel="Accept connection" pendingLabel="Saving…" hideFeedback><input type="hidden" name="connectionId" value={connectionRecord.id} /><input type="hidden" name="decision" value="accepted" /></ActionForm> : null}
          {connectionRecord?.status === "pending" && !isIncoming ? <StatusTag>Request pending</StatusTag> : null}
          <ActionForm action={blockUserAction} submitLabel="Block" pendingLabel="Blocking…" buttonVariant="quiet" buttonClassName="btn-small" confirmMessage={`Block ${profile.full_name}? This prevents direct interaction in both directions.`} hideFeedback><input type="hidden" name="targetId" value={userId} /></ActionForm>
        </div> : <ActionForm action={unblockUserAction} submitLabel="Unblock" pendingLabel="Updating…" buttonVariant="default" hideFeedback><input type="hidden" name="targetId" value={userId} /></ActionForm>}
      </div>
      {isBlockedByMe ? <div className="inline-note" style={{ marginTop: 18 }}>You blocked this profile. Skills and interaction options are hidden until you unblock this person.</div> : <div className="detail-layout" style={{ marginTop: 23 }}>
        <main>
          {profile.role === "student" ? <section><SectionHeading title="Skills" />{skillRecords.length ? <div className="tag-list">{skillRecords.map((skill) => <StatusTag key={skill.id}>{skill.name}</StatusTag>)}</div> : <EmptyState title="No skills listed">This student has not added skills to their profile.</EmptyState>}</section> : null}
          {profile.role === "organizer" && profile.organization_info ? <section><SectionHeading title="Organization information" /><p className="row-copy">{profile.organization_info}</p></section> : null}
          <section className="section"><SectionHeading title="Campus access" /><p className="row-copy">Profiles show only the information needed for campus collaboration. Contact is limited to accepted campus relationships.</p></section>
        </main>
        <aside className="content-panel"><SectionHeading title="Profile summary" /><div className="list"><div className="list-row"><div className="list-row-main"><span className="field-label">Role</span><div className="row-copy" style={{ textTransform: "capitalize" }}>{profile.role}</div></div></div>{profile.department ? <div className="list-row"><div className="list-row-main"><span className="field-label">Department</span><div className="row-copy">{profile.department}</div></div></div> : null}{profile.year_or_title ? <div className="list-row"><div className="list-row-main"><span className="field-label">Year / title</span><div className="row-copy">{profile.year_or_title}</div></div></div> : null}</div><p className="field-hint" style={{ marginTop: 13 }}><Shield size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Email addresses are not shared on profiles.</p></aside>
      </div>}
    </div>
  );
}
