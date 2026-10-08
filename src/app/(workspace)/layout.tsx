import { redirect } from "next/navigation";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { getWorkspaceContext } from "@/lib/workspace";
import type { CampusNotification } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, profile } = await getWorkspaceContext();
  if (!profile) redirect("/login");
  const { data } = await supabase
    .from("notifications")
    .select("id, type, content, read, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(8);
  return <WorkspaceFrame profile={profile} initialNotifications={(data ?? []) as CampusNotification[]}>{children}</WorkspaceFrame>;
}
