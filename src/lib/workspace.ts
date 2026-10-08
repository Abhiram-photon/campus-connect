import { redirect } from "next/navigation";
import type { Profile } from "@/lib/types";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function getWorkspaceContext(): Promise<{ supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; user: { id: string; email?: string }; profile: Profile }> {
  if (!isSupabaseConfigured()) redirect("/login?setup=1");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url, department, year_or_title, org_name, organization_info, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login?profile=missing");
  return { supabase, user, profile: profile as Profile };
}
