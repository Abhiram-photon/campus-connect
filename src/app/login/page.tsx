import { LoginForm } from "@/components/auth-forms";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ setup?: string; created?: string; profile?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const setupMessage = params.created
    ? "Account created. If email confirmation is enabled for your Supabase project, confirm your address before signing in."
    : params.profile
      ? "Your campus profile could not be loaded. Contact your workspace administrator or finish setting up the Supabase migration."
      : undefined;
  return <LoginForm configured={isSupabaseConfigured()} setupMessage={setupMessage} />;
}
