"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { SKILL_CHOICES } from "@/lib/constants";
import type { ActionState } from "@/lib/types";

export async function signInAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Add your Supabase URL and anon key to .env.local to enable sign in." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { status: "error", message: "Enter your campus email and password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: "Email or password was not accepted. Check your details and try again." };
  redirect("/home");
}

export async function signUpAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Add your Supabase URL and anon key to .env.local to enable account creation." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  const department = String(formData.get("department") ?? "").trim();
  const yearOrTitle = String(formData.get("year_or_title") ?? "").trim();
  const orgName = String(formData.get("org_name") ?? "").trim();
  const organizationInfo = String(formData.get("organization_info") ?? "").trim();
  const requestedSkills = formData.getAll("skills").map(String);
  const skills = requestedSkills.filter((skill) => (SKILL_CHOICES as readonly string[]).includes(skill));

  if (fullName.length < 2 || fullName.length > 100) return { status: "error", message: "Enter a name between 2 and 100 characters." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { status: "error", message: "Enter a valid email address." };
  if (password.length < 8) return { status: "error", message: "Use a password with at least 8 characters." };
  if (!["student", "faculty", "organizer"].includes(role)) return { status: "error", message: "Choose Student, Faculty, or Organizer." };
  if ((role === "student" || role === "faculty") && (!department || !yearOrTitle)) {
    return { status: "error", message: "Department and year or title are required for this role." };
  }
  if (role === "student" && skills.length === 0) return { status: "error", message: "Choose at least one skill for your student profile." };
  if (role === "organizer" && !orgName) return { status: "error", message: "Enter your club or organization name." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
        department: department || null,
        year_or_title: yearOrTitle || null,
        org_name: orgName || null,
        organization_info: organizationInfo || null,
        skills,
      },
    },
  });
  if (error) return { status: "error", message: "We could not create the account. Check the email, password, and Supabase Auth settings." };

  if (data.session) redirect("/home");
  redirect("/login?created=1");
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
