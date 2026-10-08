import { SignupForm } from "@/components/auth-forms";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return <SignupForm configured={isSupabaseConfigured()} />;
}
