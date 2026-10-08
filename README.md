# Campus Workspace

A private campus collaboration platform for students, faculty, and event organizers. The UI is built around dense event lists, focused Q&A, membership tables, and a split-pane messenger; there is no public social feed or recommendation model.

## Stack

- Next.js App Router, React, TypeScript
- Tailwind CSS 4 and Lucide icons
- Supabase Auth, PostgreSQL, Row Level Security, RPCs, and Realtime
- Server Components for reads and server actions for mutations

## Local setup

1. Install Node.js 20.9+ and npm. Install packages and start the app:

   ```bash
   npm install
   cp .env.example .env.local
   npm run dev
   ```

2. Create a Supabase project and add its project URL and anon/publishable key to `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
   ```

3. Apply `supabase/migrations/0001_campus_workspace.sql` to the project (Supabase CLI `supabase db push` or the SQL editor). This migration creates all tables, indexes, constraints, triggers, private authorization helpers, server RPCs, grants, RLS policies, and Realtime publication membership.
4. In Supabase Auth, configure the site URL and redirect URLs for the deployed app. Choose whether email confirmation is required. The sign-up flow creates the role-specific campus profile through a database trigger.

Do **not** put a Supabase service-role key in the browser or in a `NEXT_PUBLIC_*` variable. The app uses the anon/publishable key and the signed-in user session; the database enforces access with RLS.

Without Supabase environment variables, the sign-in and sign-up screens show the required setup steps. The app intentionally does not use fake local accounts or seeded demo users.

## Product capabilities

- **Students:** role-specific profile and skills, event registration, event-specific teammate interest and exact relational skill overlap, partner requests, connections and explainable suggestions, academic Q&A, faculty group invitations, mentorship requests, and permitted messaging.
- **Faculty:** faculty-managed groups and student invitations, mentorship sessions, capacity-checked single and bulk request approval, Q&A, and permitted messaging.
- **Organizers:** create and manage their own events, change event lifecycle status, and view registrations and teammate-interest totals.
- **All roles:** profile settings and blocking. A block is symmetric for discovery, Q&A interactions, direct contact, and shared group/mentorship conversations; it cannot be bypassed by changing a client-side ID.

## Security model

- Every product table has RLS enabled. Grants are narrowed; profile email is not selectable from the Data API.
- Mutations that need multiple checks or concurrency control use authenticated PostgreSQL RPCs. Direct event, Q&A, and session writes remain constrained by RLS and database triggers.
- Role checks are repeated in server actions and the database. UI visibility is not an authorization boundary.
- Event teammate results require a shared event, active registration, explicit teammate interest, and an exact match between the requester's `skills_needed` and candidate's `skills_offered`. Blocked users, active connections, and pending/accepted partner relationships are excluded.
- Mentorship approvals lock the session row. Both single acceptance and **Accept all eligible** enforce `accepted_count < capacity`; the bulk action accepts in request order and leaves remaining or blocked requests pending.
- Direct-message access is checked again by RLS on conversation and message reads/writes. Allowed relationships are accepted connections, accepted event partner requests, and co-membership in a group or accepted mentorship session.
- Meaningful request notifications are inserted by database triggers, not by client state.

## Project map

```text
src/app/                    App Router pages, auth actions, and workspace server actions
src/components/              Role-aware shell, forms, chat, Q&A, and shared UI
src/lib/                     Supabase clients, profile context, types, and formatting
src/proxy.ts                 Supabase session cookie refresh
supabase/migrations/         PostgreSQL schema, functions, triggers, grants, and RLS
```

## Checks

```bash
npm run typecheck
npm run build
```
