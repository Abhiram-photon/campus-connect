"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, BookOpenCheck, UsersRound } from "lucide-react";
import { signInAction, signUpAction } from "@/app/auth-actions";
import { DEPARTMENTS, ROLE_LABELS, SKILL_CHOICES } from "@/lib/constants";
import type { ActionState, UserRole } from "@/lib/types";

const EMPTY: ActionState = { status: "idle", message: "" };

export function LoginForm({ configured, setupMessage }: { configured: boolean; setupMessage?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, EMPTY);
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="brand">
          <div className="brand-mark">cw</div>
          <div><div className="brand-name">Campus Workspace</div><div className="brand-subtitle">Private campus collaboration</div></div>
        </div>
        <div className="auth-aside-inner">
          <h1>One campus, better collaboration.</h1>
          <p>A focused workspace for event teams, academic questions, faculty groups, and mentorship.</p>
          <div className="auth-steps" aria-label="Workspace areas">
            <div className="auth-step"><span>01</span><div>Discover campus events and find teammates through shared skills.</div></div>
            <div className="auth-step"><span>02</span><div>Keep collaboration connected to accepted requests and groups.</div></div>
            <div className="auth-step"><span>03</span><div>Ask questions and request faculty mentorship.</div></div>
          </div>
        </div>
        <div style={{ color: "#7b8885", fontSize: 11 }}>For your campus community</div>
      </aside>
      <main className="auth-main">
        <div className="auth-form-wrap">
          <div className="auth-topline"><span>Campus Workspace</span><span>Private access</span></div>
          {configured ? null : (
            <div className="config-warning" role="status">
              Supabase is not connected. Copy <code>.env.example</code> to <code>.env.local</code>, add your project URL and anon key, and apply the included migration.
            </div>
          )}
          {setupMessage ? <div className="config-warning">{setupMessage}</div> : null}
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-subtitle">Use the account you created for your campus workspace.</p>
          <form action={formAction} className="auth-fields">
            <label className="field">
              <span className="field-label">Email</span>
              <input className="control" type="email" name="email" autoComplete="email" required placeholder="you@campus.edu" />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input className="control" type="password" name="password" autoComplete="current-password" required minLength={8} />
            </label>
            {state.message ? <p className={`form-feedback ${state.status}`} role="alert">{state.message}</p> : null}
            <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}<ArrowRight size={15} />
            </button>
          </form>
          <p className="auth-footer">New to the campus workspace? <Link href="/signup">Create an account</Link></p>
        </div>
      </main>
    </div>
  );
}

export function SignupForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState(signUpAction, EMPTY);
  const [role, setRole] = useState<UserRole>("student");
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="brand">
          <div className="brand-mark">cw</div>
          <div><div className="brand-name">Campus Workspace</div><div className="brand-subtitle">Private campus collaboration</div></div>
        </div>
        <div className="auth-aside-inner">
          <div style={{ color: "var(--accent)", marginBottom: 13 }}><BookOpenCheck size={24} strokeWidth={1.7} /></div>
          <h1>Set up the right campus profile.</h1>
          <p>Your selected role determines what you can create and manage. It is enforced by the database, not just the interface.</p>
          <div className="auth-steps">
            <div className="auth-step"><span><UsersRound size={13} /></span><div>Students add skills for event teammate discovery.</div></div>
            <div className="auth-step"><span>02</span><div>Faculty manage groups and mentorship sessions.</div></div>
            <div className="auth-step"><span>03</span><div>Organizers publish and manage campus events.</div></div>
          </div>
        </div>
        <div style={{ color: "#7b8885", fontSize: 11 }}>Role-specific access · campus-only profiles</div>
      </aside>
      <main className="auth-main" style={{ alignItems: "flex-start", paddingTop: 28, paddingBottom: 28 }}>
        <div className="auth-form-wrap">
          <div className="auth-topline"><span>Campus Workspace</span><Link href="/login" className="text-link">Already have an account?</Link></div>
          {!configured ? <div className="config-warning">Supabase is not connected. Account creation will work after your project URL, anon key, and migration are configured.</div> : null}
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Choose a role and add the minimum information needed to collaborate.</p>
          <form action={formAction} className="auth-fields">
            <div className="field">
              <span className="field-label">Campus role</span>
              <div className="role-options">
                {(["student", "faculty", "organizer"] as UserRole[]).map((value) => (
                  <label className="role-choice" key={value}>
                    <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} />
                    <span>{ROLE_LABELS[value]}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="field"><span className="field-label">Full name</span><input className="control" name="full_name" required minLength={2} maxLength={100} autoComplete="name" /></label>
            <label className="field"><span className="field-label">Email</span><input className="control" type="email" name="email" required autoComplete="email" placeholder="you@campus.edu" /></label>
            <label className="field"><span className="field-label">Password</span><input className="control" type="password" name="password" required minLength={8} autoComplete="new-password" /><span className="field-hint">At least 8 characters.</span></label>

            {role === "student" ? (
              <>
                <div className="form-grid">
                  <label className="field"><span className="field-label">Department / branch</span><select className="control" name="department" defaultValue="" required><option value="" disabled>Select department</option>{DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
                  <label className="field"><span className="field-label">Year of study</span><select className="control" name="year_or_title" defaultValue="" required><option value="" disabled>Select year</option><option>1st year</option><option>2nd year</option><option>3rd year</option><option>4th year</option><option>Postgraduate</option><option>Research scholar</option></select></label>
                </div>
                <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
                  <legend className="field-label" style={{ marginBottom: 7 }}>Skills <span style={{ color: "#87919a", fontWeight: 400 }}>· select at least one</span></legend>
                  <div className="checkbox-grid">
                    {SKILL_CHOICES.map((skill) => <label className="checkbox-row" key={skill}><input type="checkbox" name="skills" value={skill} /><span>{skill}</span></label>)}
                  </div>
                </fieldset>
              </>
            ) : null}
            {role === "faculty" ? (
              <div className="form-grid">
                <label className="field"><span className="field-label">Department</span><select className="control" name="department" defaultValue="" required><option value="" disabled>Select department</option>{DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
                <label className="field"><span className="field-label">Designation / title</span><input className="control" name="year_or_title" required placeholder="Associate Professor" /></label>
              </div>
            ) : null}
            {role === "organizer" ? (
              <>
                <label className="field"><span className="field-label">Club or organization</span><input className="control" name="org_name" required placeholder="Robotics Club" /></label>
                <label className="field"><span className="field-label">Organization information <span style={{ color: "#87919a", fontWeight: 400 }}>· optional</span></span><textarea className="control" name="organization_info" maxLength={1000} placeholder="A short description of the campus group." /></label>
              </>
            ) : null}
            {state.message ? <p className={`form-feedback ${state.status}`} role="alert">{state.message}</p> : null}
            <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>
              {pending ? "Creating account…" : "Create account"}<ArrowRight size={15} />
            </button>
          </form>
          <p className="auth-footer">By creating an account, you join a private campus workspace.</p>
        </div>
      </main>
    </div>
  );
}
