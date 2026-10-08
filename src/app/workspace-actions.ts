"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { safeActionMessage } from "@/lib/format";
import type { ActionState, Profile } from "@/lib/types";

const ok = (message: string): ActionState => ({ status: "success", message });
const fail = (message: string): ActionState => ({ status: "error", message });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ActionContext = { supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; userId: string; profile: Profile };

async function actionContext(roles?: string[]): Promise<ActionContext | ActionState> {
  if (!isSupabaseConfigured()) return fail("Connect Supabase before making workspace changes.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Sign in again to continue.");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url, department, year_or_title, org_name, organization_info")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile) return fail("Your campus profile could not be loaded. Sign in again or contact support.");
  if (roles && !roles.includes(profile.role)) return fail("You do not have permission to perform this action.");
  return { supabase, userId: user.id, profile: profile as Profile };
}

function isActionContext(value: ActionContext | ActionState): value is ActionContext {
  return "supabase" in value;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parseCampusLocalDate(value: string): Date {
  // datetime-local has no timezone. Campus event/mentorship times are interpreted as IST.
  return new Date(`${value}:00+05:30`);
}

function idFrom(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return UUID_RE.test(value) ? value : null;
}

function actionError(error: { message?: string } | null | undefined, fallback: string): ActionState {
  return fail(safeActionMessage(error?.message, fallback));
}

function refresh(...paths: string[]) {
  for (const path of paths) revalidatePath(path);
}

export async function registerForEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const eventId = idFrom(formData, "eventId");
  if (!eventId) return fail("This event could not be identified. Refresh and try again.");
  const { error } = await ctx.supabase.rpc("register_for_event", { p_event_id: eventId });
  if (error) return actionError(error, "Unable to register for this event.");
  refresh("/events", `/events/${eventId}`, "/home");
  return ok("You are registered for this event.");
}

export async function cancelEventRegistrationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const eventId = idFrom(formData, "eventId");
  if (!eventId) return fail("This event could not be identified.");
  const { error } = await ctx.supabase.rpc("cancel_event_registration", { p_event_id: eventId });
  if (error) return actionError(error, "Unable to cancel the event registration.");
  refresh("/events", `/events/${eventId}`, "/home");
  return ok("Your registration was cancelled.");
}

export async function saveEventInterestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const eventId = idFrom(formData, "eventId");
  const offered = formData.getAll("skills_offered").map(String).filter((id) => UUID_RE.test(id));
  const needed = formData.getAll("skills_needed").map(String).filter((id) => UUID_RE.test(id));
  if (!eventId) return fail("This event could not be identified.");
  if (!needed.length) return fail("Choose at least one skill you need for your team.");
  const { error } = await ctx.supabase.rpc("set_event_interest", {
    p_event_id: eventId,
    p_skills_offered: offered,
    p_skills_needed: needed,
  });
  if (error) return actionError(error, "Unable to save your teammate preferences.");
  refresh(`/events/${eventId}`, "/events", "/home");
  return ok("Your teammate preferences are saved.");
}

export async function sendPartnerRequestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const eventId = idFrom(formData, "eventId");
  const receiverId = idFrom(formData, "receiverId");
  if (!eventId || !receiverId) return fail("The teammate request could not be identified.");
  const { error } = await ctx.supabase.rpc("send_partner_request", { p_event_id: eventId, p_receiver_id: receiverId });
  if (error) return actionError(error, "Unable to send the partner request.");
  refresh("/connections", "/messages", `/events/${eventId}`);
  return ok("Partner request sent.");
}

export async function cancelPartnerRequestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const requestId = idFrom(formData, "requestId");
  if (!requestId) return fail("The partner request could not be identified.");
  const { error } = await ctx.supabase.rpc("cancel_partner_request", { p_request_id: requestId });
  if (error) return actionError(error, "Unable to cancel the partner request.");
  refresh("/connections", "/events");
  return ok("Partner request cancelled.");
}

export async function respondPartnerRequestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const requestId = idFrom(formData, "requestId");
  const decision = text(formData, "decision");
  if (!requestId || !["accepted", "declined"].includes(decision)) return fail("The partner request could not be updated.");
  const { error } = await ctx.supabase.rpc("respond_partner_request", { p_request_id: requestId, p_decision: decision });
  if (error) return actionError(error, "Unable to update the partner request.");
  refresh("/connections", "/messages");
  return ok(decision === "accepted" ? "Partner request accepted. Messaging is now available." : "Partner request declined.");
}

export async function sendConnectionRequestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const targetId = idFrom(formData, "targetId");
  if (!targetId) return fail("The student could not be identified.");
  const { error } = await ctx.supabase.rpc("send_connection_request", { p_target_id: targetId });
  if (error) return actionError(error, "Unable to send the connection request.");
  refresh("/connections", "/home");
  return ok("Connection request sent.");
}

export async function respondConnectionRequestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const connectionId = idFrom(formData, "connectionId");
  const decision = text(formData, "decision");
  if (!connectionId || !["accepted", "declined"].includes(decision)) return fail("The connection request could not be updated.");
  const { error } = await ctx.supabase.rpc("respond_connection_request", { p_connection_id: connectionId, p_decision: decision });
  if (error) return actionError(error, "Unable to update the connection request.");
  refresh("/connections", "/messages");
  return ok(decision === "accepted" ? "Connection accepted. Messaging is now available." : "Connection request declined.");
}

export async function createEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["organizer"]);
  if (!isActionContext(ctx)) return ctx;
  const title = text(formData, "title");
  const description = text(formData, "description");
  const eventDateRaw = text(formData, "event_date");
  const deadlineRaw = text(formData, "registration_deadline");
  const status = text(formData, "status");
  const eventDate = parseCampusLocalDate(eventDateRaw);
  const deadline = parseCampusLocalDate(deadlineRaw);
  if (title.length < 3 || description.length < 1 || Number.isNaN(eventDate.getTime()) || Number.isNaN(deadline.getTime())) {
    return fail("Add an event title, description, date, and registration deadline.");
  }
  if (deadline >= eventDate || eventDate <= new Date()) return fail("The registration deadline must be before a future event date.");
  if (!["upcoming", "registration_open"].includes(status)) return fail("Choose a valid event status.");
  const { error } = await ctx.supabase.from("events").insert({
    organizer_id: ctx.userId,
    title,
    description,
    event_date: eventDate.toISOString(),
    registration_deadline: deadline.toISOString(),
    status,
  });
  if (error) return actionError(error, "Unable to create the event.");
  refresh("/events", "/home");
  return ok("Event created.");
}

export async function updateEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["organizer"]);
  if (!isActionContext(ctx)) return ctx;
  const eventId = idFrom(formData, "eventId");
  const title = text(formData, "title");
  const description = text(formData, "description");
  const eventDate = parseCampusLocalDate(text(formData, "event_date"));
  const deadline = parseCampusLocalDate(text(formData, "registration_deadline"));
  const status = text(formData, "status");
  if (!eventId || title.length < 3 || !description || Number.isNaN(eventDate.getTime()) || Number.isNaN(deadline.getTime())) return fail("Complete the event fields before saving.");
  if (deadline >= eventDate) return fail("The registration deadline must be before the event date.");
  if (!["upcoming", "registration_open", "registration_closed", "completed"].includes(status)) return fail("Choose a valid event status.");
  const { data, error } = await ctx.supabase.from("events").update({
    title,
    description,
    event_date: eventDate.toISOString(),
    registration_deadline: deadline.toISOString(),
    status,
  }).eq("id", eventId).eq("organizer_id", ctx.userId).select("id").maybeSingle();
  if (error) return actionError(error, "Unable to update this event.");
  if (!data) return fail("This event is unavailable or you do not manage it.");
  refresh("/events", `/events/${eventId}`, "/home");
  return ok("Event details saved.");
}

export async function createPostAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student", "faculty"]);
  if (!isActionContext(ctx)) return ctx;
  const title = text(formData, "title");
  const content = text(formData, "content");
  if (title.length < 5 || !content) return fail("Add a clear question title and some detail.");
  if (title.length > 180 || content.length > 12000) return fail("The question is longer than the allowed limit.");
  const { error } = await ctx.supabase.from("posts").insert({ author_id: ctx.userId, title, content });
  if (error) return actionError(error, "Unable to publish the question.");
  refresh("/qa", "/home");
  return ok("Question posted to campus Q&A.");
}

export async function togglePostUpvoteAction(postId: string, currentlyUpvoted: boolean): Promise<ActionState> {
  const ctx = await actionContext(["student", "faculty"]);
  if (!isActionContext(ctx)) return ctx;
  if (!UUID_RE.test(postId)) return fail("This question could not be identified.");
  const result = currentlyUpvoted
    ? await ctx.supabase.from("post_upvotes").delete().eq("post_id", postId).eq("user_id", ctx.userId)
    : await ctx.supabase.from("post_upvotes").upsert({ post_id: postId, user_id: ctx.userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
  if (result.error) return actionError(result.error, "Unable to update your upvote.");
  refresh("/qa");
  return ok(currentlyUpvoted ? "Upvote removed." : "Question upvoted.");
}

export async function createCommentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student", "faculty"]);
  if (!isActionContext(ctx)) return ctx;
  const postId = idFrom(formData, "postId");
  const parentCommentId = idFrom(formData, "parentCommentId");
  const content = text(formData, "content");
  if (!postId || !content) return fail("Write a reply before submitting.");
  const { error } = await ctx.supabase.from("comments").insert({
    post_id: postId,
    parent_comment_id: parentCommentId,
    author_id: ctx.userId,
    content,
  });
  if (error) return actionError(error, "Unable to add your reply.");
  refresh("/qa");
  return ok("Reply added.");
}

export async function sendMessageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext();
  if (!isActionContext(ctx)) return ctx;
  const conversationId = idFrom(formData, "conversationId");
  const content = text(formData, "content");
  if (!conversationId || !content) return fail("Write a message before sending.");
  if (content.length > 5000) return fail("Messages are limited to 5,000 characters.");
  const { error } = await ctx.supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: ctx.userId,
    content,
  });
  if (error) return actionError(error, "Unable to send the message. Check that you still have access to this conversation.");
  refresh("/messages");
  return ok("Message sent.");
}

export async function createGroupAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["faculty"]);
  if (!isActionContext(ctx)) return ctx;
  const name = text(formData, "name");
  const description = text(formData, "description");
  if (name.length < 3) return fail("Group name must be at least 3 characters.");
  const { error } = await ctx.supabase.rpc("create_faculty_group", { p_name: name, p_description: description });
  if (error) return actionError(error, "Unable to create the group.");
  refresh("/groups", "/home", "/messages");
  return ok("Group created. You are its administrator.");
}

export async function inviteGroupStudentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["faculty"]);
  if (!isActionContext(ctx)) return ctx;
  const groupId = idFrom(formData, "groupId");
  const studentId = idFrom(formData, "studentId");
  if (!groupId || !studentId) return fail("Select a student and group before inviting.");
  const { error } = await ctx.supabase.rpc("invite_group_student", { p_group_id: groupId, p_student_id: studentId });
  if (error) return actionError(error, "Unable to send the group invitation.");
  refresh("/groups", "/messages");
  return ok("Group invitation sent.");
}

export async function respondGroupInviteAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const groupId = idFrom(formData, "groupId");
  const decision = text(formData, "decision");
  if (!groupId || !["accepted", "declined"].includes(decision)) return fail("The group invitation could not be updated.");
  const { error } = await ctx.supabase.rpc("respond_group_invitation", { p_group_id: groupId, p_decision: decision });
  if (error) return actionError(error, "Unable to update the group invitation.");
  refresh("/groups", "/messages");
  return ok(decision === "accepted" ? "You joined the group." : "Invitation declined.");
}

export async function removeGroupStudentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["faculty"]);
  if (!isActionContext(ctx)) return ctx;
  const groupId = idFrom(formData, "groupId");
  const studentId = idFrom(formData, "studentId");
  if (!groupId || !studentId) return fail("The group member could not be identified.");
  const { error } = await ctx.supabase.rpc("remove_group_student", { p_group_id: groupId, p_student_id: studentId });
  if (error) return actionError(error, "Unable to remove this group member.");
  refresh("/groups", "/messages");
  return ok("Group member removed.");
}

export async function createMentorshipSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["faculty"]);
  if (!isActionContext(ctx)) return ctx;
  const title = text(formData, "title");
  const description = text(formData, "description");
  const sessionDate = parseCampusLocalDate(text(formData, "session_date"));
  const capacity = Number(text(formData, "capacity"));
  const status = text(formData, "status");
  if (title.length < 3 || !description || Number.isNaN(sessionDate.getTime()) || sessionDate <= new Date()) return fail("Enter a title, description, and future session date.");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return fail("Capacity must be a whole number between 1 and 500.");
  if (!["draft", "published"].includes(status)) return fail("Choose Draft or Published.");
  const { error } = await ctx.supabase.from("mentorship_sessions").insert({
    faculty_id: ctx.userId,
    title,
    description,
    session_date: sessionDate.toISOString(),
    capacity,
    status,
  });
  if (error) return actionError(error, "Unable to create the mentorship session.");
  refresh("/mentorship", "/home", "/messages");
  return ok(status === "published" ? "Mentorship session published." : "Draft session saved.");
}

export async function updateMentorshipSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["faculty"]);
  if (!isActionContext(ctx)) return ctx;
  const sessionId = idFrom(formData, "sessionId");
  const title = text(formData, "title");
  const description = text(formData, "description");
  const sessionDate = parseCampusLocalDate(text(formData, "session_date"));
  const capacity = Number(text(formData, "capacity"));
  const status = text(formData, "status");
  if (!sessionId || title.length < 3 || !description || Number.isNaN(sessionDate.getTime())) return fail("Complete the session details before saving.");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return fail("Capacity must be a whole number between 1 and 500.");
  if (!["draft", "published", "closed", "completed"].includes(status)) return fail("Choose a valid mentorship status.");
  const { data, error } = await ctx.supabase.from("mentorship_sessions").update({ title, description, session_date: sessionDate.toISOString(), capacity, status })
    .eq("id", sessionId).eq("faculty_id", ctx.userId).select("id").maybeSingle();
  if (error) return actionError(error, "Unable to update the mentorship session.");
  if (!data) return fail("This mentorship session is unavailable or you do not manage it.");
  refresh("/mentorship", "/home");
  return ok("Mentorship session updated.");
}

export async function requestMentorshipAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const sessionId = idFrom(formData, "sessionId");
  if (!sessionId) return fail("This session could not be identified.");
  const { error } = await ctx.supabase.rpc("request_mentorship", { p_session_id: sessionId });
  if (error) return actionError(error, "Unable to request this mentorship session.");
  refresh("/mentorship");
  return ok("Mentorship request sent.");
}

export async function cancelMentorshipAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["student"]);
  if (!isActionContext(ctx)) return ctx;
  const requestId = idFrom(formData, "requestId");
  if (!requestId) return fail("This mentorship request could not be identified.");
  const { error } = await ctx.supabase.rpc("cancel_mentorship_request", { p_request_id: requestId });
  if (error) return actionError(error, "Unable to cancel the mentorship request.");
  refresh("/mentorship", "/messages");
  return ok("Mentorship request cancelled.");
}

export async function respondMentorshipAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["faculty"]);
  if (!isActionContext(ctx)) return ctx;
  const requestId = idFrom(formData, "requestId");
  const decision = text(formData, "decision");
  if (!requestId || !["accepted", "declined"].includes(decision)) return fail("The mentorship request could not be updated.");
  const { error } = await ctx.supabase.rpc("respond_mentorship_request", { p_request_id: requestId, p_decision: decision });
  if (error) return actionError(error, "Unable to update the mentorship request.");
  refresh("/mentorship", "/messages");
  return ok(decision === "accepted" ? "Request accepted." : "Request declined.");
}

export async function acceptAllMentorshipAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext(["faculty"]);
  if (!isActionContext(ctx)) return ctx;
  const sessionId = idFrom(formData, "sessionId");
  if (!sessionId) return fail("This mentorship session could not be identified.");
  const { data, error } = await ctx.supabase.rpc("accept_all_mentorship_requests", { p_session_id: sessionId });
  if (error) return actionError(error, "Unable to accept eligible requests.");
  const accepted = Number(data?.accepted_now ?? 0);
  const remaining = Number(data?.remaining_pending ?? 0);
  refresh("/mentorship", "/messages");
  return ok(`${accepted} request${accepted === 1 ? "" : "s"} accepted. ${remaining} remain pending; capacity was not exceeded.`);
}

export async function updateProfileAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext();
  if (!isActionContext(ctx)) return ctx;
  const fullName = text(formData, "full_name");
  const department = text(formData, "department");
  const yearOrTitle = text(formData, "year_or_title");
  const orgName = text(formData, "org_name");
  const organizationInfo = text(formData, "organization_info");
  const skillIds = formData.getAll("skillIds").map(String).filter((id) => UUID_RE.test(id));
  if (fullName.length < 2) return fail("Enter your full name.");
  if ((ctx.profile.role === "student" || ctx.profile.role === "faculty") && (!department || !yearOrTitle)) return fail("Department and year or title are required.");
  if (ctx.profile.role === "organizer" && !orgName) return fail("Organization name is required.");
  const { error } = await ctx.supabase.rpc("update_my_profile", {
    p_full_name: fullName,
    p_department: department,
    p_year_or_title: yearOrTitle,
    p_org_name: orgName,
    p_organization_info: organizationInfo,
    p_skill_ids: skillIds,
  });
  if (error) return actionError(error, "Unable to save your profile.");
  refresh("/settings", "/home", "/connections");
  return ok("Profile updated.");
}

export async function blockUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext();
  if (!isActionContext(ctx)) return ctx;
  const targetId = idFrom(formData, "targetId");
  if (!targetId) return fail("Select a valid student to block.");
  const { error } = await ctx.supabase.rpc("block_user", { p_target_id: targetId });
  if (error) return actionError(error, "Unable to block this user.");
  refresh("/settings", "/connections", "/messages", "/events", "/groups", "/mentorship");
  return ok("User blocked. Both accounts can no longer interact directly or appear in each other’s discovery results.");
}

export async function unblockUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext();
  if (!isActionContext(ctx)) return ctx;
  const targetId = idFrom(formData, "targetId");
  if (!targetId) return fail("This user could not be identified.");
  const { error } = await ctx.supabase.rpc("unblock_user", { p_target_id: targetId });
  if (error) return actionError(error, "Unable to unblock this user.");
  refresh("/settings");
  return ok("User unblocked.");
}

export async function markNotificationReadAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await actionContext();
  if (!isActionContext(ctx)) return ctx;
  const notificationId = idFrom(formData, "notificationId");
  if (!notificationId) return fail("This notification could not be identified.");
  const { error } = await ctx.supabase.from("notifications").update({ read: true }).eq("id", notificationId).eq("user_id", ctx.userId);
  if (error) return actionError(error, "Unable to mark this notification as read.");
  refresh("/home", "/events", "/connections", "/qa", "/messages", "/groups", "/mentorship", "/settings");
  return ok("Notification marked as read.");
}
