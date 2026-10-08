import type { EventStatus, RequestStatus, UserRole } from "@/lib/types";

export interface EventListRow {
  id: string;
  title: string;
  description: string;
  organizer_id: string;
  event_date: string;
  registration_deadline: string;
  status: EventStatus;
  created_at?: string;
  updated_at?: string;
}

export interface EventOwnerRow {
  id: string;
  title: string;
  event_date: string;
  registration_deadline?: string;
  status: EventStatus;
  description?: string;
}

export interface RegistrationRow {
  id?: string;
  event_id: string;
  user_id?: string;
  status: "registered" | "cancelled";
  looking_for_teammates: boolean;
  skills_offered?: string[];
  skills_needed?: string[];
  created_at?: string;
}

export interface RegistrationInterestRow {
  event_id: string;
  status: "registered" | "cancelled";
  looking_for_teammates: boolean;
}

export interface EventAttendeeRegistrationRow {
  id: string;
  user_id: string;
  status: "registered" | "cancelled";
  looking_for_teammates: boolean;
  skills_offered: string[];
  skills_needed: string[];
  created_at: string;
}

export interface EventManagementRow extends EventOwnerRow {
  description: string;
}

export interface OrganizerDashboardEventRow {
  id: string;
  title: string;
  event_date: string;
  registration_deadline: string;
  status: EventStatus;
}

export interface BasicProfileRow {
  id: string;
  full_name: string;
  role?: UserRole;
  department?: string | null;
  year_or_title?: string | null;
  org_name?: string | null;
  organization_info?: string | null;
}

export interface ConnectionRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  requested_by: string;
  status: "pending" | "accepted" | "declined" | "blocked";
  created_at: string;
}

export interface PartnerRequestRow {
  id: string;
  event_id: string;
  sender_id: string;
  receiver_id: string;
  status: RequestStatus;
  created_at: string;
}

export interface ConnectionSuggestionRow {
  user_id: string;
  full_name: string;
  department: string | null;
  year_or_title: string | null;
  shared_department: boolean;
  shared_skills: string[];
  shared_event_count: number;
  mutual_connections: number;
}

export interface TeammateMatchRow {
  user_id: string;
  full_name: string;
  department: string | null;
  year_or_title: string | null;
  offered_skills: string[];
  matched_skills: string[];
  matched_count: number;
  required_count: number;
  overlap_percent: number;
}

export interface PostRow {
  id: string;
  author_id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface CommentRow {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_id: string;
  content: string;
  created_at: string;
}

export interface VoteRow {
  post_id: string;
  user_id: string;
}

export interface GroupRow {
  id: string;
  faculty_id?: string;
  name: string;
  description: string;
  created_at?: string;
}

export interface GroupMemberRow {
  group_id: string;
  user_id: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "declined";
  invited_by?: string;
  created_at: string;
}

export interface MentorshipSessionRow {
  id: string;
  faculty_id?: string;
  title: string;
  description?: string;
  session_date: string;
  capacity: number;
  status: "draft" | "published" | "closed" | "completed";
  created_at?: string;
}

export interface MentorshipRequestRow {
  id: string;
  session_id: string;
  student_id: string;
  status: RequestStatus;
  created_at: string;
}

export interface MentorshipAvailabilityRow {
  session_id: string;
  accepted_count: number;
  remaining_capacity: number;
}

export interface ConversationRow {
  id: string;
  kind: "direct" | "group" | "mentorship";
  user_a_id: string | null;
  user_b_id: string | null;
  group_id: string | null;
  session_id: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface StudentSearchRow {
  user_id: string;
  full_name: string;
  department: string | null;
  year_or_title: string | null;
}

export interface CampusProfileSearchRow extends StudentSearchRow {
  role: UserRole;
  org_name: string | null;
}
