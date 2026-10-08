"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell, CalendarDays, CircleHelp, DoorOpen, GraduationCap, Home,
  MessageSquare, Settings, Users, UsersRound, UserRound,
} from "lucide-react";
import { signOutAction } from "@/app/auth-actions";
import { markNotificationReadAction } from "@/app/workspace-actions";
import { ActionForm } from "@/components/action-form";
import { formatRelative, initials } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { CampusNotification, Profile, UserRole } from "@/lib/types";

const NAVIGATION: Record<UserRole, { label: string; href: string; icon: typeof Home }[]> = {
  student: [
    { label: "Home", href: "/home", icon: Home },
    { label: "Events", href: "/events", icon: CalendarDays },
    { label: "Connections", href: "/connections", icon: UsersRound },
    { label: "Q&A", href: "/qa", icon: CircleHelp },
    { label: "Messages", href: "/messages", icon: MessageSquare },
    { label: "Mentorship", href: "/mentorship", icon: GraduationCap },
  ],
  faculty: [
    { label: "Home", href: "/home", icon: Home },
    { label: "Groups", href: "/groups", icon: Users },
    { label: "Mentorship", href: "/mentorship", icon: GraduationCap },
    { label: "Q&A", href: "/qa", icon: CircleHelp },
    { label: "Messages", href: "/messages", icon: MessageSquare },
  ],
  organizer: [
    { label: "Home", href: "/home", icon: Home },
    { label: "Events", href: "/events", icon: CalendarDays },
  ],
};

export function WorkspaceFrame({
  profile,
  initialNotifications,
  children,
}: {
  profile: Profile;
  initialNotifications: CampusNotification[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const links = NAVIGATION[profile.role];
  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <Link className="brand" href="/home" aria-label="Campus Workspace home">
          <div className="brand-mark">cw</div>
          <div><div className="brand-name">Campus Workspace</div><div className="brand-subtitle">Private campus collaboration</div></div>
        </Link>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {links.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== "/home" && pathname.startsWith(`${href}/`));
            return (
              <Link className={`nav-link ${active ? "active" : ""}`} href={href} key={href} aria-current={active ? "page" : undefined}>
                <Icon size={16} strokeWidth={1.8} /><span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="nav-list" style={{ marginBottom: 10 }}>
          <Link className={`nav-link ${pathname === "/settings" ? "active" : ""}`} href="/settings">
            <Settings size={16} strokeWidth={1.8} /><span>Settings & safety</span>
          </Link>
        </div>
        <div className="sidebar-user">
          <div className="avatar-small">{initials(profile.full_name)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="sidebar-user-name">{profile.full_name}</div>
            <div className="sidebar-user-meta">{profile.role}</div>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-context"><strong>Campus workspace</strong><span> · </span><span>Private collaboration</span></div>
          <div className="topbar-actions">
            <span className="topbar-identity">{profile.full_name}</span>
            <NotificationMenu userId={profile.id} initialNotifications={initialNotifications} />
            <Link href="/settings" className="btn btn-quiet btn-small" aria-label="Settings"><UserRound size={15} /></Link>
            <form action={signOutAction}>
              <button className="btn btn-quiet btn-small" aria-label="Sign out" title="Sign out"><DoorOpen size={15} /></button>
            </form>
          </div>
        </header>
        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}

function NotificationMenu({ userId, initialNotifications }: { userId: string; initialNotifications: CampusNotification[] }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const unread = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null = null;
    try {
      const supabase = createSupabaseBrowserClient();
      channel = supabase
        .channel(`notifications:${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload: { new: CampusNotification }) => {
          const next = payload.new;
          setNotifications((current) => [next, ...current.filter((item) => item.id !== next.id)].slice(0, 8));
        })
        .subscribe();
    } catch {
      // The server-rendered notification list remains available without realtime configuration.
    }
    return () => {
      if (channel) void createSupabaseBrowserClient().removeChannel(channel);
    };
  }, [userId]);

  return (
    <div className="notification-popover">
      <button className="btn btn-quiet btn-small" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell size={15} />{unread ? <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>{unread}</span> : null}
      </button>
      {open ? (
        <div className="notification-menu" role="dialog" aria-label="Notifications">
          <div className="notification-menu-head"><strong style={{ fontSize: 12 }}>Notifications</strong><button className="btn btn-quiet btn-small" onClick={() => setOpen(false)}>Close</button></div>
          {notifications.length ? notifications.map((notification) => (
            <div className="notification-row" key={notification.id}>
              {!notification.read ? <span className="notification-unread" /> : <span style={{ width: 6, flex: "0 0 6px" }} />}
              <div className="notification-copy">{notification.content}<time>{formatRelative(notification.created_at)}</time></div>
              {!notification.read ? (
                <ActionForm action={markNotificationReadAction} submitLabel="Read" pendingLabel="…" buttonVariant="quiet" buttonClassName="btn-small" className="notification-read-form" hideFeedback>
                  <input type="hidden" name="notificationId" value={notification.id} />
                </ActionForm>
              ) : null}
            </div>
          )) : <div className="empty-state" style={{ margin: 10, padding: 16 }}><strong>You're all caught up</strong><p>Meaningful request updates will appear here.</p></div>}
        </div>
      ) : null}
    </div>
  );
}
