export type UserRole = "student" | "faculty" | "organizer";
export type EventStatus = "upcoming" | "registration_open" | "registration_closed" | "completed";
export type RequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  department: string | null;
  year_or_title: string | null;
  org_name: string | null;
  organization_info?: string | null;
  created_at?: string;
}

export interface Skill {
  id: string;
  name: string;
}

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  organizer_id: string;
  event_date: string;
  registration_deadline: string;
  status: EventStatus;
  created_at: string;
  updated_at?: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  user_id: string;
  status: "registered" | "cancelled";
  looking_for_teammates: boolean;
  skills_offered: string[];
  skills_needed: string[];
}

export interface CampusNotification {
  id: string;
  type: string;
  content: string;
  read: boolean;
  created_at: string;
}

export interface ActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export const EMPTY_ACTION_STATE: ActionState = { status: "idle", message: "" };
