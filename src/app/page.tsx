import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function IndexPage() {
  if (!isSupabaseConfigured()) return <LoginForm configured={false} setupMessage="Start here: connect a Supabase project before signing in or creating a campus account." />;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? "/home" : "/login");
}
