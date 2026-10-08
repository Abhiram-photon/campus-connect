import type { EventStatus } from "@/lib/types";

export function formatDate(value: string, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatRelative(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "";
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

export function eventStatusLabel(status: EventStatus): string {
  return {
    upcoming: "Upcoming",
    registration_open: "Registration open",
    registration_closed: "Registration closed",
    completed: "Completed",
  }[status];
}

export function requestStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function isEventRegistrationOpen(event: { status: string; event_date: string; registration_deadline: string }): boolean {
  return event.status === "registration_open" && new Date(event.registration_deadline).getTime() > Date.now() && new Date(event.event_date).getTime() > Date.now();
}

export function safeActionMessage(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (message.length > 220) return fallback;
  return message.replace(/^.*ERROR:\s*/i, "").replace(/\s*\(SQLSTATE[^)]*\).*$/i, "");
}
