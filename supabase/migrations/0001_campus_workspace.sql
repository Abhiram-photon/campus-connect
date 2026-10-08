-- Private Campus Collaboration Platform
-- Apply with `supabase db push` or paste into the Supabase SQL editor.
-- The application uses only the anon/publishable key; authorization lives here in RLS/RPCs.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.user_role as enum ('student', 'faculty', 'organizer');
create type public.event_status as enum ('upcoming', 'registration_open', 'registration_closed', 'completed');
create type public.registration_status as enum ('registered', 'cancelled');
create type public.request_status as enum ('pending', 'accepted', 'declined', 'cancelled');
create type public.connection_status as enum ('pending', 'accepted', 'declined', 'blocked');
create type public.group_member_status as enum ('pending', 'accepted', 'declined');
create type public.group_member_role as enum ('admin', 'member');
create type public.mentorship_session_status as enum ('draft', 'published', 'closed', 'completed');
create type public.conversation_kind as enum ('direct', 'group', 'mentorship');

-- Identity and onboarding
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 100),
  email text not null unique,
  role public.user_role not null,
  avatar_url text,
  department text,
  year_or_title text,
  org_name text,
  organization_info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_student_fields check (
    role <> 'student' or (nullif(btrim(department), '') is not null and nullif(btrim(year_or_title), '') is not null)
  ),
  constraint profiles_faculty_fields check (
    role <> 'faculty' or (nullif(btrim(department), '') is not null and nullif(btrim(year_or_title), '') is not null)
  ),
  constraint profiles_organizer_fields check (
    role <> 'organizer' or nullif(btrim(org_name), '') is not null
  )
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 60)
);

create table public.user_skills (
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

insert into public.skills(name) values
  ('C'), ('C++'), ('Java'), ('Python'), ('JavaScript'), ('TypeScript'),
  ('React'), ('Node.js'), ('SQL'), ('PostgreSQL'), ('Machine Learning'),
  ('Data Analysis'), ('UI/UX'), ('Figma'), ('Cybersecurity'),
  ('Embedded Systems'), ('Arduino'), ('Cloud Computing'), ('Git'),
  ('HTML & CSS'), ('Next.js'), ('Public Speaking'), ('Research'),
  ('Technical Writing'), ('Project Management')
on conflict (name) do nothing;

-- Events and event-specific collaboration interest
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  description text not null check (char_length(btrim(description)) between 1 and 6000),
  organizer_id uuid not null references public.profiles(id) on delete restrict,
  event_date timestamptz not null,
  registration_deadline timestamptz not null,
  status public.event_status not null default 'upcoming',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_deadline_before_event check (registration_deadline < event_date)
);
create index events_date_idx on public.events(event_date);
create index events_organizer_idx on public.events(organizer_id, event_date desc);
create index events_status_idx on public.events(status, event_date);

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.registration_status not null default 'registered',
  looking_for_teammates boolean not null default false,
  -- UUID arrays keep the event-specific skill declaration compact; a trigger validates
  -- both the skill foreign keys and that offered skills belong to this student's profile.
  skills_offered uuid[] not null default '{}'::uuid[],
  skills_needed uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index event_registrations_event_idx on public.event_registrations(event_id, status, looking_for_teammates);
create index event_registrations_user_idx on public.event_registrations(user_id, status);

create table public.partner_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);
create unique index partner_requests_pending_unique
  on public.partner_requests(event_id, sender_id, receiver_id) where status = 'pending';
create index partner_requests_receiver_idx on public.partner_requests(receiver_id, status, created_at desc);
create index partner_requests_sender_idx on public.partner_requests(sender_id, status, created_at desc);

-- Persistent connections are distinct from event partner requests.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status public.connection_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_a_id < user_b_id),
  check (requested_by = user_a_id or requested_by = user_b_id),
  unique (user_a_id, user_b_id)
);
create index connections_user_a_idx on public.connections(user_a_id, status);
create index connections_user_b_idx on public.connections(user_b_id, status);

-- A separate table gives blocking symmetric effects without conflating a block with a connection.
create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks(blocked_id, blocker_id);

-- Campus Q&A
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 180),
  content text not null check (char_length(btrim(content)) between 1 and 12000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_created_at_idx on public.posts(created_at desc);
create index posts_author_idx on public.posts(author_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index comments_post_created_idx on public.comments(post_id, created_at);
create index comments_parent_idx on public.comments(parent_comment_id);

create or replace function private.validate_comment_thread()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_parent_post_id uuid;
begin
  if new.parent_comment_id is not null then
    select post_id into v_parent_post_id from public.comments where id = new.parent_comment_id;
    if not found or v_parent_post_id <> new.post_id then
      raise exception 'A reply must belong to the same question as its parent comment';
    end if;
  end if;
  return new;
end;
$$;
create trigger comments_validate_thread before insert or update of post_id, parent_comment_id on public.comments
for each row execute function private.validate_comment_thread();

create table public.post_upvotes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_upvotes_user_idx on public.post_upvotes(user_id, post_id);

-- Faculty-created groups and explicit membership invitations.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index groups_faculty_idx on public.groups(faculty_id, created_at desc);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_member_role not null default 'member',
  status public.group_member_status not null default 'pending',
  invited_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  check (role <> 'admin' or status = 'accepted')
);
create index group_members_user_idx on public.group_members(user_id, status);
create index group_members_group_idx on public.group_members(group_id, status);

-- Faculty mentorship opportunities with capacity-controlled requests.
create table public.mentorship_sessions (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null check (char_length(btrim(description)) between 1 and 6000),
  session_date timestamptz not null,
  capacity integer not null check (capacity between 1 and 500),
  status public.mentorship_session_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mentorship_sessions_faculty_idx on public.mentorship_sessions(faculty_id, session_date);
create index mentorship_sessions_published_idx on public.mentorship_sessions(status, session_date);

create table public.mentorship_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mentorship_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);
create index mentorship_requests_session_idx on public.mentorship_requests(session_id, status, created_at);
create index mentorship_requests_student_idx on public.mentorship_requests(student_id, status);

-- Conversations are relationship-scoped. Membership is materialized for realtime/list queries,
-- while RLS re-checks the underlying connection, partner, group, mentorship and block state.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  user_a_id uuid references public.profiles(id) on delete cascade,
  user_b_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  session_id uuid references public.mentorship_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_shape check (
    (kind = 'direct' and user_a_id is not null and user_b_id is not null and user_a_id < user_b_id and group_id is null and session_id is null)
    or (kind = 'group' and user_a_id is null and user_b_id is null and group_id is not null and session_id is null)
    or (kind = 'mentorship' and user_a_id is null and user_b_id is null and group_id is null and session_id is not null)
  )
);
create unique index conversations_direct_unique on public.conversations(user_a_id, user_b_id) where kind = 'direct';
create unique index conversations_group_unique on public.conversations(group_id) where kind = 'group';
create unique index conversations_mentorship_unique on public.conversations(session_id) where kind = 'mentorship';

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members(user_id, conversation_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in (
    'connection_request', 'connection_accepted', 'connection_declined',
    'partner_request', 'partner_accepted', 'partner_declined',
    'group_invitation', 'group_invitation_accepted', 'group_invitation_declined',
    'mentorship_request', 'mentorship_accepted', 'mentorship_declined', 'mentorship_cancelled'
  )),
  content text not null check (char_length(content) between 1 and 300),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);

-- Timestamp maintenance and auth/profile bootstrap.
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.protect_profile_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.role <> old.role then
    raise exception 'Profile identity and role cannot be changed';
  end if;
  -- Email is not writable through the Data API; it may be synchronized by the auth trigger.
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role;
  v_name text;
  v_department text;
  v_year_or_title text;
  v_org_name text;
  v_org_info text;
  v_skill text;
begin
  begin
    v_role := lower(coalesce(new.raw_user_meta_data ->> 'role', ''))::public.user_role;
  exception when others then
    raise exception 'Choose a valid campus role';
  end;
  v_name := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  v_department := nullif(btrim(new.raw_user_meta_data ->> 'department'), '');
  v_year_or_title := nullif(btrim(new.raw_user_meta_data ->> 'year_or_title'), '');
  v_org_name := nullif(btrim(new.raw_user_meta_data ->> 'org_name'), '');
  v_org_info := nullif(btrim(new.raw_user_meta_data ->> 'organization_info'), '');

  insert into public.profiles(id, full_name, email, role, department, year_or_title, org_name, organization_info)
  values (new.id, coalesce(v_name, 'Campus member'), lower(new.email), v_role, v_department, v_year_or_title, v_org_name, v_org_info);

  if v_role = 'student' and jsonb_typeof(new.raw_user_meta_data -> 'skills') = 'array' then
    for v_skill in
      select distinct lower(btrim(value))
      from jsonb_array_elements_text(new.raw_user_meta_data -> 'skills') as entry(value)
      where nullif(btrim(value), '') is not null
    loop
      insert into public.user_skills(user_id, skill_id)
      select new.id, s.id from public.skills s where lower(s.name) = v_skill
      on conflict (user_id, skill_id) do nothing;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function private.sync_auth_user_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email), updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

create trigger auth_user_profile_insert
after insert on auth.users for each row execute function private.handle_new_auth_user();
create trigger auth_user_email_update
after update of email on auth.users for each row execute function private.sync_auth_user_email();

create trigger profiles_protect_identity before update on public.profiles
for each row execute function private.protect_profile_identity();
create trigger profiles_touch_updated before update on public.profiles
for each row execute function private.touch_updated_at();

create trigger events_touch_updated before update on public.events
for each row execute function private.touch_updated_at();
create trigger event_registrations_touch_updated before update on public.event_registrations
for each row execute function private.touch_updated_at();
create trigger partner_requests_touch_updated before update on public.partner_requests
for each row execute function private.touch_updated_at();
create trigger connections_touch_updated before update on public.connections
for each row execute function private.touch_updated_at();
create trigger posts_touch_updated before update on public.posts
for each row execute function private.touch_updated_at();
create trigger groups_touch_updated before update on public.groups
for each row execute function private.touch_updated_at();
create trigger group_members_touch_updated before update on public.group_members
for each row execute function private.touch_updated_at();
create trigger mentorship_sessions_touch_updated before update on public.mentorship_sessions
for each row execute function private.touch_updated_at();
create trigger mentorship_requests_touch_updated before update on public.mentorship_requests
for each row execute function private.touch_updated_at();

create or replace function private.validate_event_owner()
returns trigger language plpgsql set search_path = '' as $$
declare v_role public.user_role;
begin
  if tg_op = 'UPDATE' and new.organizer_id <> old.organizer_id then
    raise exception 'Event ownership cannot be transferred';
  end if;
  select role into v_role from public.profiles where id = new.organizer_id;
  if v_role is distinct from 'organizer'::public.user_role then
    raise exception 'Only an organizer can own an event';
  end if;
  if new.registration_deadline >= new.event_date then
    raise exception 'Registration deadline must be before the event date';
  end if;
  if new.status = 'registration_open' and (new.registration_deadline <= now() or new.event_date <= now()) then
    raise exception 'Registration can only open before its deadline and event date';
  end if;
  if new.status in ('upcoming', 'registration_closed') and new.event_date <= now() then
    raise exception 'A past event must be marked completed';
  end if;
  if new.status = 'completed' and new.event_date > now() then
    raise exception 'An event can only be completed after its date';
  end if;
  return new;
end;
$$;
create trigger events_validate_owner before insert or update on public.events
for each row execute function private.validate_event_owner();

create or replace function private.validate_event_registration_skills()
returns trigger language plpgsql set search_path = '' as $$
declare v_role public.user_role;
begin
  select role into v_role from public.profiles where id = new.user_id;
  if v_role is distinct from 'student'::public.user_role then
    raise exception 'Only students can register for events';
  end if;
  if exists (
    select 1 from unnest(new.skills_offered) as x(skill_id)
    left join public.skills s on s.id = x.skill_id where s.id is null
  ) or exists (
    select 1 from unnest(new.skills_needed) as x(skill_id)
    left join public.skills s on s.id = x.skill_id where s.id is null
  ) then
    raise exception 'One or more selected skills do not exist';
  end if;
  if cardinality(new.skills_offered) <> (select count(distinct x.skill_id) from unnest(new.skills_offered) as x(skill_id))
     or cardinality(new.skills_needed) <> (select count(distinct x.skill_id) from unnest(new.skills_needed) as x(skill_id)) then
    raise exception 'Duplicate skills are not allowed';
  end if;
  if exists (
    select 1 from unnest(new.skills_offered) as x(skill_id)
    where not exists (select 1 from public.user_skills us where us.user_id = new.user_id and us.skill_id = x.skill_id)
  ) then
    raise exception 'Offered skills must be on your profile';
  end if;
  return new;
end;
$$;
create trigger event_registrations_validate_skills before insert or update on public.event_registrations
for each row execute function private.validate_event_registration_skills();

create or replace function private.validate_group_member()
returns trigger language plpgsql set search_path = '' as $$
declare v_faculty uuid; v_role public.user_role;
begin
  select faculty_id into v_faculty from public.groups where id = new.group_id;
  select role into v_role from public.profiles where id = new.user_id;
  if new.role = 'admin' and (new.user_id <> v_faculty or v_role <> 'faculty') then
    raise exception 'A group administrator must be its faculty creator';
  end if;
  if new.role = 'member' and v_role <> 'student' then
    raise exception 'Faculty groups invite students only';
  end if;
  return new;
end;
$$;
create trigger group_members_validate before insert or update on public.group_members
for each row execute function private.validate_group_member();

create or replace function private.validate_mentorship_session_owner()
returns trigger language plpgsql set search_path = '' as $$
declare v_role public.user_role;
begin
  if tg_op = 'UPDATE' and new.faculty_id <> old.faculty_id then
    raise exception 'Session ownership cannot be transferred';
  end if;
  select role into v_role from public.profiles where id = new.faculty_id;
  if v_role is distinct from 'faculty'::public.user_role then
    raise exception 'Only faculty can host mentorship sessions';
  end if;
  if new.status in ('draft', 'published') and new.session_date <= now() then
    raise exception 'Draft and published sessions require a future date';
  end if;
  if new.status = 'completed' and new.session_date > now() then
    raise exception 'A session can only be completed after its date';
  end if;
  return new;
end;
$$;
create trigger mentorship_sessions_validate_owner before insert or update on public.mentorship_sessions
for each row execute function private.validate_mentorship_session_owner();

create or replace function private.validate_mentorship_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_accepted integer;
begin
  select count(*) into v_accepted from public.mentorship_requests
    where session_id = new.id and status = 'accepted';
  if new.capacity < v_accepted then
    raise exception 'Capacity cannot be lower than the number of accepted requests';
  end if;
  return new;
end;
$$;
create trigger mentorship_sessions_validate_capacity before update of capacity on public.mentorship_sessions
for each row execute function private.validate_mentorship_capacity();

create or replace function private.validate_mentorship_request_student()
returns trigger language plpgsql set search_path = '' as $$
declare v_role public.user_role;
begin
  select role into v_role from public.profiles where id = new.student_id;
  if v_role is distinct from 'student'::public.user_role then
    raise exception 'Only students can request mentorship';
  end if;
  return new;
end;
$$;
create trigger mentorship_requests_validate_student before insert or update on public.mentorship_requests
for each row execute function private.validate_mentorship_request_student();

-- Private authorization helpers used in policies and by the RPC layer.
create or replace function private.is_blocked_between(p_user_a uuid, p_user_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_user_a and b.blocked_id = p_user_b)
       or (b.blocker_id = p_user_b and b.blocked_id = p_user_a)
  );
$$;

create or replace function private.has_accepted_connection(p_user_a uuid, p_user_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and c.user_a_id = least(p_user_a, p_user_b)
      and c.user_b_id = greatest(p_user_a, p_user_b)
  );
$$;

create or replace function private.has_accepted_partner(p_user_a uuid, p_user_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.partner_requests pr
    where pr.status = 'accepted'
      and ((pr.sender_id = p_user_a and pr.receiver_id = p_user_b)
        or (pr.sender_id = p_user_b and pr.receiver_id = p_user_a))
  );
$$;

create or replace function private.is_group_participant(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.faculty_id = p_user_id
  ) or exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_user_id
      and gm.status = 'accepted'
  );
$$;

create or replace function private.is_mentorship_participant(p_session_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.mentorship_sessions ms
    where ms.id = p_session_id and ms.faculty_id = p_user_id
  ) or exists (
    select 1 from public.mentorship_requests mr
    where mr.session_id = p_session_id and mr.student_id = p_user_id
      and mr.status = 'accepted'
  );
$$;

create or replace function private.can_start_direct(p_user_a uuid, p_user_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_a is not null and p_user_b is not null and p_user_a <> p_user_b
    and not private.is_blocked_between(p_user_a, p_user_b)
    and (
      private.has_accepted_connection(p_user_a, p_user_b)
      or private.has_accepted_partner(p_user_a, p_user_b)
      or exists (
        select 1 from public.group_members a
        join public.group_members b on b.group_id = a.group_id
        where a.user_id = p_user_a and b.user_id = p_user_b
          and a.status = 'accepted' and b.status = 'accepted'
      )
      or exists (
        select 1 from public.mentorship_sessions ms
        where private.is_mentorship_participant(ms.id, p_user_a)
          and private.is_mentorship_participant(ms.id, p_user_b)
      )
    );
$$;

create or replace function private.can_access_group_conversation(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_group_participant(p_group_id, p_user_id)
    and not exists (
      select 1 from public.group_members other_member
      where other_member.group_id = p_group_id and other_member.status = 'accepted'
        and other_member.user_id <> p_user_id
        and private.is_blocked_between(p_user_id, other_member.user_id)
    );
$$;

create or replace function private.can_access_mentorship_conversation(p_session_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with participants as (
    select ms.faculty_id as user_id from public.mentorship_sessions ms where ms.id = p_session_id
    union
    select mr.student_id as user_id from public.mentorship_requests mr
      where mr.session_id = p_session_id and mr.status = 'accepted'
  )
  select private.is_mentorship_participant(p_session_id, p_user_id)
    and not exists (
      select 1 from participants other_participant
      where other_participant.user_id <> p_user_id
        and private.is_blocked_between(p_user_id, other_participant.user_id)
    );
$$;

create or replace function private.can_access_conversation(p_conversation_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case c.kind
      when 'direct' then (p_user_id = c.user_a_id or p_user_id = c.user_b_id)
        and private.can_start_direct(c.user_a_id, c.user_b_id)
      when 'group' then private.can_access_group_conversation(c.group_id, p_user_id)
      when 'mentorship' then private.can_access_mentorship_conversation(c.session_id, p_user_id)
      else false
    end
    from public.conversations c where c.id = p_conversation_id
  ), false);
$$;

create or replace function private.can_view_group(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups g where g.id = p_group_id and g.faculty_id = p_user_id)
    or exists (select 1 from public.group_members gm where gm.group_id = p_group_id and gm.user_id = p_user_id);
$$;

create or replace function private.can_view_event_registration(
  p_event_id uuid,
  p_user_id uuid,
  p_looking boolean,
  p_status public.registration_status
)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = p_event_id and e.organizer_id = auth.uid())
    or (
      p_status = 'registered' and p_looking
      and not private.is_blocked_between(auth.uid(), p_user_id)
      and exists (
        select 1
        from public.event_registrations mine
        join public.event_registrations candidate on candidate.event_id = mine.event_id
        where mine.event_id = p_event_id and mine.user_id = auth.uid()
          and mine.status = 'registered' and mine.looking_for_teammates
          and candidate.user_id = p_user_id and candidate.status = 'registered'
          and candidate.looking_for_teammates
          and cardinality(mine.skills_needed) > 0
          and mine.skills_needed && candidate.skills_offered
      )
      and not exists (
        select 1 from public.connections c
        where c.user_a_id = least(auth.uid(), p_user_id)
          and c.user_b_id = greatest(auth.uid(), p_user_id)
          and c.status in ('pending', 'accepted')
      )
      and not exists (
        select 1 from public.partner_requests pr
        where pr.event_id = p_event_id and pr.status in ('pending', 'accepted')
          and ((pr.sender_id = auth.uid() and pr.receiver_id = p_user_id)
            or (pr.sender_id = p_user_id and pr.receiver_id = auth.uid()))
      )
    );
$$;

-- Database-created collaboration conversations.
create or replace function private.create_group_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_conversation_id uuid;
begin
  insert into public.group_members(group_id, user_id, role, status, invited_by)
  values (new.id, new.faculty_id, 'admin', 'accepted', new.faculty_id)
  on conflict (group_id, user_id) do nothing;
  insert into public.conversations(kind, created_by, group_id)
  values ('group', new.faculty_id, new.id)
  on conflict (group_id) where kind = 'group' do update set group_id = excluded.group_id
  returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id, user_id)
  values (v_conversation_id, new.faculty_id) on conflict do nothing;
  return new;
end;
$$;
create trigger groups_create_conversation after insert on public.groups
for each row execute function private.create_group_conversation();

create or replace function private.sync_group_conversation_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_conversation_id uuid; v_group_id uuid; v_user_id uuid; v_status public.group_member_status;
begin
  if tg_op = 'DELETE' then
    v_group_id := old.group_id; v_user_id := old.user_id;
  else
    v_group_id := new.group_id; v_user_id := new.user_id; v_status := new.status;
  end if;
  select c.id into v_conversation_id from public.conversations c where c.kind = 'group' and c.group_id = v_group_id;
  if v_conversation_id is not null then
    if tg_op <> 'DELETE' and v_status = 'accepted' then
      insert into public.conversation_members(conversation_id, user_id)
      values (v_conversation_id, v_user_id) on conflict do nothing;
    else
      delete from public.conversation_members where conversation_id = v_conversation_id and user_id = v_user_id;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger group_members_sync_conversation
after insert or update of status or delete on public.group_members
for each row execute function private.sync_group_conversation_member();

create or replace function private.create_mentorship_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_conversation_id uuid;
begin
  insert into public.conversations(kind, created_by, session_id)
  values ('mentorship', new.faculty_id, new.id)
  on conflict (session_id) where kind = 'mentorship' do update set session_id = excluded.session_id
  returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id, user_id)
  values (v_conversation_id, new.faculty_id) on conflict do nothing;
  return new;
end;
$$;
create trigger mentorship_sessions_create_conversation after insert on public.mentorship_sessions
for each row execute function private.create_mentorship_conversation();

create or replace function private.sync_mentorship_conversation_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_conversation_id uuid; v_session_id uuid; v_student_id uuid; v_status public.request_status;
begin
  if tg_op = 'DELETE' then
    v_session_id := old.session_id; v_student_id := old.student_id;
  else
    v_session_id := new.session_id; v_student_id := new.student_id; v_status := new.status;
  end if;
  select c.id into v_conversation_id from public.conversations c where c.kind = 'mentorship' and c.session_id = v_session_id;
  if v_conversation_id is not null then
    if tg_op <> 'DELETE' and v_status = 'accepted' then
      insert into public.conversation_members(conversation_id, user_id)
      values (v_conversation_id, v_student_id) on conflict do nothing;
    else
      delete from public.conversation_members where conversation_id = v_conversation_id and user_id = v_student_id;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger mentorship_requests_sync_conversation
after insert or update of status or delete on public.mentorship_requests
for each row execute function private.sync_mentorship_conversation_member();

-- Notifications are generated only by meaningful database state transitions.
create or replace function private.notify_connection_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_recipient uuid; v_content text; v_type text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_recipient := case when new.requested_by = new.user_a_id then new.user_b_id else new.user_a_id end;
    v_type := 'connection_request'; v_content := 'You received a campus connection request.';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'declined') then
    v_recipient := new.requested_by;
    if new.status = 'accepted' then v_type := 'connection_accepted'; v_content := 'Your connection request was accepted.';
    else v_type := 'connection_declined'; v_content := 'Your connection request was declined.'; end if;
  elsif tg_op = 'UPDATE' and old.status <> 'pending' and new.status = 'pending' then
    v_recipient := case when new.requested_by = new.user_a_id then new.user_b_id else new.user_a_id end;
    v_type := 'connection_request'; v_content := 'You received a campus connection request.';
  else
    return new;
  end if;
  insert into public.notifications(user_id, type, content) values (v_recipient, v_type, v_content);
  return new;
end;
$$;
create trigger connections_notify_transition after insert or update of status on public.connections
for each row execute function private.notify_connection_transition();

create or replace function private.notify_partner_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_recipient uuid; v_type text; v_content text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_recipient := new.receiver_id; v_type := 'partner_request'; v_content := 'You received an event partner request.';
  elsif tg_op = 'UPDATE' and old.status in ('declined', 'cancelled') and new.status = 'pending' then
    v_recipient := new.receiver_id; v_type := 'partner_request'; v_content := 'You received an event partner request.';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'declined') then
    v_recipient := new.sender_id;
    if new.status = 'accepted' then v_type := 'partner_accepted'; v_content := 'Your event partner request was accepted.';
    else v_type := 'partner_declined'; v_content := 'Your event partner request was declined.'; end if;
  else
    return new;
  end if;
  insert into public.notifications(user_id, type, content) values (v_recipient, v_type, v_content);
  return new;
end;
$$;
create trigger partner_requests_notify_transition after insert or update of status on public.partner_requests
for each row execute function private.notify_partner_transition();

create or replace function private.notify_group_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_recipient uuid; v_type text; v_content text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_recipient := new.user_id; v_type := 'group_invitation'; v_content := 'A faculty member invited you to a campus group.';
  elsif tg_op = 'UPDATE' and old.status = 'declined' and new.status = 'pending' then
    v_recipient := new.user_id; v_type := 'group_invitation'; v_content := 'A faculty member invited you to a campus group.';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'declined') then
    v_recipient := new.invited_by;
    if new.status = 'accepted' then v_type := 'group_invitation_accepted'; v_content := 'A student accepted your group invitation.';
    else v_type := 'group_invitation_declined'; v_content := 'A student declined your group invitation.'; end if;
  else
    return new;
  end if;
  insert into public.notifications(user_id, type, content) values (v_recipient, v_type, v_content);
  return new;
end;
$$;
create trigger group_members_notify_transition after insert or update of status on public.group_members
for each row execute function private.notify_group_transition();

create or replace function private.notify_mentorship_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_faculty_id uuid; v_recipient uuid; v_type text; v_content text;
begin
  select faculty_id into v_faculty_id from public.mentorship_sessions where id = new.session_id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_recipient := v_faculty_id; v_type := 'mentorship_request'; v_content := 'A student requested a mentorship session.';
  elsif tg_op = 'UPDATE' and old.status in ('declined', 'cancelled') and new.status = 'pending' then
    v_recipient := v_faculty_id; v_type := 'mentorship_request'; v_content := 'A student requested a mentorship session.';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'declined') then
    v_recipient := new.student_id;
    if new.status = 'accepted' then v_type := 'mentorship_accepted'; v_content := 'Your mentorship request was accepted.';
    else v_type := 'mentorship_declined'; v_content := 'Your mentorship request was declined.'; end if;
  elsif tg_op = 'UPDATE' and old.status in ('pending', 'accepted') and new.status = 'cancelled' then
    v_recipient := v_faculty_id; v_type := 'mentorship_cancelled'; v_content := 'A student cancelled a mentorship request.';
  else
    return new;
  end if;
  insert into public.notifications(user_id, type, content) values (v_recipient, v_type, v_content);
  return new;
end;
$$;
create trigger mentorship_requests_notify_transition after insert or update of status on public.mentorship_requests
for each row execute function private.notify_mentorship_transition();

-- Atomic event registration and teammate-interest workflows.
create or replace function public.register_for_event(p_event_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_event public.events%rowtype; v_registration_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'student') then
    raise exception 'Only students can register for events';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if v_event.status <> 'registration_open' or v_event.registration_deadline <= now() or v_event.event_date <= now() then
    raise exception 'Registration is closed for this event';
  end if;
  insert into public.event_registrations(event_id, user_id, status)
  values (p_event_id, v_user_id, 'registered')
  on conflict (event_id, user_id) do update set
    status = 'registered', looking_for_teammates = false,
    skills_offered = '{}'::uuid[], skills_needed = '{}'::uuid[], updated_at = now()
  returning id into v_registration_id;
  return v_registration_id;
end;
$$;

create or replace function public.cancel_event_registration(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  update public.event_registrations set status = 'cancelled', looking_for_teammates = false,
    skills_offered = '{}'::uuid[], skills_needed = '{}'::uuid[]
  where event_id = p_event_id and user_id = v_user_id and status = 'registered';
  if not found then raise exception 'Active registration not found'; end if;
end;
$$;

create or replace function public.set_event_interest(p_event_id uuid, p_skills_offered uuid[], p_skills_needed uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_offered uuid[] := coalesce(p_skills_offered, '{}'::uuid[]); v_needed uuid[] := coalesce(p_skills_needed, '{}'::uuid[]);
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'student') then
    raise exception 'Only students can show event interest';
  end if;
  if cardinality(v_needed) = 0 then raise exception 'Choose at least one skill you need'; end if;
  if exists (select 1 from unnest(v_offered) x(skill_id) where not exists (select 1 from public.user_skills us where us.user_id = v_user_id and us.skill_id = x.skill_id)) then
    raise exception 'Offered skills must be on your profile';
  end if;
  if exists (select 1 from unnest(v_offered || v_needed) x(skill_id) where not exists (select 1 from public.skills s where s.id = x.skill_id)) then
    raise exception 'One or more selected skills do not exist';
  end if;
  if cardinality(v_offered) <> (select count(distinct x.skill_id) from unnest(v_offered) x(skill_id))
     or cardinality(v_needed) <> (select count(distinct x.skill_id) from unnest(v_needed) x(skill_id)) then
    raise exception 'Duplicate skills are not allowed';
  end if;
  update public.event_registrations set looking_for_teammates = true,
    skills_offered = v_offered, skills_needed = v_needed
  where event_id = p_event_id and user_id = v_user_id and status = 'registered';
  if not found then raise exception 'Register for the event before showing interest'; end if;
end;
$$;

create or replace function public.find_event_teammates(p_event_id uuid)
returns table (
  user_id uuid,
  full_name text,
  department text,
  year_or_title text,
  offered_skills text[],
  matched_skills text[],
  matched_count integer,
  required_count integer,
  overlap_percent numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_required integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'student') then
    raise exception 'Only students can find teammates';
  end if;
  select cardinality(r.skills_needed) into v_required
  from public.event_registrations r
  where r.event_id = p_event_id and r.user_id = v_user_id
    and r.status = 'registered' and r.looking_for_teammates;
  if coalesce(v_required, 0) = 0 then return; end if;

  return query
  with mine as (
    select r.skills_needed from public.event_registrations r
    where r.event_id = p_event_id and r.user_id = v_user_id
      and r.status = 'registered' and r.looking_for_teammates
  ), candidate_rows as (
    select r.user_id, p.full_name, p.department, p.year_or_title, r.skills_offered,
      array_agg(distinct s.name order by s.name) as offered_names,
      array_agg(distinct s.name order by s.name) filter (where s.id = any(m.skills_needed)) as matched_names,
      count(distinct s.id) filter (where s.id = any(m.skills_needed))::integer as matches,
      cardinality(m.skills_needed)::integer as required
    from public.event_registrations r
    join public.profiles p on p.id = r.user_id
    cross join mine m
    cross join lateral unnest(r.skills_offered) offered(skill_id)
    join public.skills s on s.id = offered.skill_id
    where r.event_id = p_event_id and r.status = 'registered'
      and r.looking_for_teammates = true and r.user_id <> v_user_id
      and not private.is_blocked_between(v_user_id, r.user_id)
      and not exists (
        select 1 from public.connections c
        where c.user_a_id = least(v_user_id, r.user_id) and c.user_b_id = greatest(v_user_id, r.user_id)
          and c.status in ('pending', 'accepted')
      )
      and not exists (
        select 1 from public.partner_requests pr
        where pr.event_id = p_event_id and pr.status in ('pending', 'accepted')
          and ((pr.sender_id = v_user_id and pr.receiver_id = r.user_id)
            or (pr.sender_id = r.user_id and pr.receiver_id = v_user_id))
      )
    group by r.user_id, p.full_name, p.department, p.year_or_title, r.skills_offered, m.skills_needed
    having count(distinct s.id) filter (where s.id = any(m.skills_needed)) > 0
  )
  select c.user_id, c.full_name, c.department, c.year_or_title,
    c.offered_names, c.matched_names, c.matches, c.required,
    round((100.0 * c.matches / nullif(c.required, 0))::numeric, 1)
  from candidate_rows c
  order by c.matches desc, c.full_name asc;
end;
$$;

create or replace function public.send_partner_request(p_event_id uuid, p_receiver_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_existing public.partner_requests%rowtype; v_request_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_receiver_id = v_user_id then raise exception 'You cannot request yourself'; end if;
  if private.is_blocked_between(v_user_id, p_receiver_id) then raise exception 'This request is unavailable'; end if;
  -- Serialize requests for the same event/pair, including opposite-direction submissions.
  perform pg_advisory_xact_lock(hashtextextended(
    p_event_id::text || ':' || least(v_user_id, p_receiver_id)::text || ':' || greatest(v_user_id, p_receiver_id)::text,
    0
  ));
  if not exists (select 1 from public.profiles where id = v_user_id and role = 'student')
     or not exists (select 1 from public.profiles where id = p_receiver_id and role = 'student') then
    raise exception 'Partner requests are for students';
  end if;
  if not exists (
    select 1 from public.event_registrations mine
    join public.event_registrations theirs on theirs.event_id = mine.event_id
    where mine.event_id = p_event_id and mine.user_id = v_user_id and theirs.user_id = p_receiver_id
      and mine.status = 'registered' and theirs.status = 'registered'
      and mine.looking_for_teammates and theirs.looking_for_teammates
      and mine.skills_needed && theirs.skills_offered
      and exists (select 1 from public.events e where e.id = p_event_id and e.event_date > now() and e.status <> 'completed')
  ) then raise exception 'A shared event registration and relevant skill overlap are required'; end if;
  if exists (select 1 from public.partner_requests pr where pr.event_id = p_event_id
    and pr.status = 'accepted' and ((pr.sender_id = v_user_id and pr.receiver_id = p_receiver_id)
      or (pr.sender_id = p_receiver_id and pr.receiver_id = v_user_id))) then
    raise exception 'You are already event partners';
  end if;
  if exists (select 1 from public.partner_requests pr where pr.event_id = p_event_id
    and pr.status = 'pending' and ((pr.sender_id = v_user_id and pr.receiver_id = p_receiver_id)
      or (pr.sender_id = p_receiver_id and pr.receiver_id = v_user_id))) then
    raise exception 'A partner request is already pending';
  end if;
  select * into v_existing from public.partner_requests
    where event_id = p_event_id and sender_id = v_user_id and receiver_id = p_receiver_id
    order by created_at desc limit 1 for update;
  if found then
    update public.partner_requests set status = 'pending', created_at = now()
      where id = v_existing.id returning id into v_request_id;
  else
    insert into public.partner_requests(event_id, sender_id, receiver_id)
      values (p_event_id, v_user_id, p_receiver_id) returning id into v_request_id;
  end if;
  return v_request_id;
end;
$$;

create or replace function public.respond_partner_request(p_request_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_request public.partner_requests%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('accepted', 'declined') then raise exception 'Invalid decision'; end if;
  select * into v_request from public.partner_requests where id = p_request_id for update;
  if not found or v_request.receiver_id <> v_user_id or v_request.status <> 'pending' then
    raise exception 'Partner request is not available';
  end if;
  if private.is_blocked_between(v_user_id, v_request.sender_id) then raise exception 'This request is unavailable'; end if;
  update public.partner_requests set status = p_decision::public.request_status where id = p_request_id;
end;
$$;

create or replace function public.cancel_partner_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  update public.partner_requests set status = 'cancelled'
    where id = p_request_id and sender_id = v_user_id and status = 'pending';
  if not found then raise exception 'Pending partner request not found'; end if;
end;
$$;

-- Persistent student-to-student connections.
create or replace function public.send_connection_request(p_target_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_a uuid; v_b uuid; v_existing public.connections%rowtype; v_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_target_id = v_user_id then raise exception 'You cannot connect with yourself'; end if;
  if private.is_blocked_between(v_user_id, p_target_id) then raise exception 'This connection is unavailable'; end if;
  if not exists (select 1 from public.profiles where id = v_user_id and role = 'student')
     or not exists (select 1 from public.profiles where id = p_target_id and role = 'student') then
    raise exception 'Connections are currently available between students';
  end if;
  v_a := least(v_user_id, p_target_id); v_b := greatest(v_user_id, p_target_id);
  perform pg_advisory_xact_lock(hashtextextended('connection:' || v_a::text || ':' || v_b::text, 0));
  select * into v_existing from public.connections where user_a_id = v_a and user_b_id = v_b for update;
  if found then
    if v_existing.status = 'accepted' then raise exception 'You are already connected'; end if;
    if v_existing.status = 'pending' then
      if v_existing.requested_by = v_user_id then raise exception 'Connection request already sent'; end if;
      -- A reciprocal request accepts the outstanding request rather than creating a duplicate.
      update public.connections set status = 'accepted' where id = v_existing.id returning id into v_id;
      return v_id;
    end if;
    update public.connections set status = 'pending', requested_by = v_user_id, created_at = now()
      where id = v_existing.id returning id into v_id;
  else
    insert into public.connections(user_a_id, user_b_id, requested_by)
      values (v_a, v_b, v_user_id) returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.respond_connection_request(p_connection_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_connection public.connections%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('accepted', 'declined') then raise exception 'Invalid decision'; end if;
  select * into v_connection from public.connections where id = p_connection_id for update;
  if not found or v_connection.status <> 'pending' or v_connection.requested_by = v_user_id
     or (v_user_id <> v_connection.user_a_id and v_user_id <> v_connection.user_b_id) then
    raise exception 'Connection request is not available';
  end if;
  if private.is_blocked_between(v_user_id, v_connection.requested_by) then raise exception 'This request is unavailable'; end if;
  update public.connections set status = p_decision::public.connection_status where id = p_connection_id;
end;
$$;

-- Explainable, relational student suggestions; no opaque score or external model.
create or replace function public.connection_suggestions()
returns table (
  user_id uuid,
  full_name text,
  department text,
  year_or_title text,
  shared_department boolean,
  shared_skills text[],
  shared_event_count integer,
  mutual_connections integer
)
language plpgsql stable security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_department text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = v_user_id and role = 'student') then return; end if;
  select p.department into v_department from public.profiles p where p.id = v_user_id;
  return query
  select p.id, p.full_name, p.department, p.year_or_title,
    (p.department is not null and p.department = v_department),
    coalesce((
      select array_agg(s.name order by s.name)
      from public.user_skills mine join public.user_skills theirs on theirs.skill_id = mine.skill_id
      join public.skills s on s.id = mine.skill_id
      where mine.user_id = v_user_id and theirs.user_id = p.id
    ), '{}'::text[]),
    (
      select count(distinct mine.event_id)::integer
      from public.event_registrations mine join public.event_registrations theirs on theirs.event_id = mine.event_id
      where mine.user_id = v_user_id and theirs.user_id = p.id
        and mine.status = 'registered' and theirs.status = 'registered'
    ),
    (
      select count(distinct mutual.user_id)::integer
      from (
        select case when c.user_a_id = v_user_id then c.user_b_id else c.user_a_id end as user_id
        from public.connections c where c.status = 'accepted' and v_user_id in (c.user_a_id, c.user_b_id)
      ) mine
      join (
        select case when c.user_a_id = p.id then c.user_b_id else c.user_a_id end as user_id
        from public.connections c where c.status = 'accepted' and p.id in (c.user_a_id, c.user_b_id)
      ) mutual on mutual.user_id = mine.user_id
      where mutual.user_id <> v_user_id and mutual.user_id <> p.id
    )
  from public.profiles p
  where p.role = 'student' and p.id <> v_user_id
    and not private.is_blocked_between(v_user_id, p.id)
    and not exists (select 1 from public.connections c where c.user_a_id = least(v_user_id, p.id)
      and c.user_b_id = greatest(v_user_id, p.id) and c.status in ('pending', 'accepted'))
    and (
      (p.department is not null and p.department = v_department)
      or exists (select 1 from public.user_skills a join public.user_skills b on b.skill_id = a.skill_id
        where a.user_id = v_user_id and b.user_id = p.id)
      or exists (select 1 from public.event_registrations a join public.event_registrations b on b.event_id = a.event_id
        where a.user_id = v_user_id and b.user_id = p.id and a.status = 'registered' and b.status = 'registered')
      or exists (
        select 1 from public.connections a join public.connections b
          on (case when a.user_a_id = v_user_id then a.user_b_id else a.user_a_id end)
           = (case when b.user_a_id = p.id then b.user_b_id else b.user_a_id end)
        where a.status = 'accepted' and v_user_id in (a.user_a_id, a.user_b_id)
          and b.status = 'accepted' and p.id in (b.user_a_id, b.user_b_id)
      )
    )
  order by
    ((p.department is not null and p.department = v_department)::integer) desc,
    (
      select count(*) from public.user_skills a join public.user_skills b on b.skill_id = a.skill_id
      where a.user_id = v_user_id and b.user_id = p.id
    ) desc,
    p.full_name asc
  limit 20;
end;
$$;

create or replace function public.search_students(p_query text)
returns table (user_id uuid, full_name text, department text, year_or_title text)
language plpgsql stable security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_query text := btrim(coalesce(p_query, ''));
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'faculty') then
    raise exception 'Only faculty can search for group invitees';
  end if;
  if char_length(v_query) < 2 then return; end if;
  return query
    select p.id, p.full_name, p.department, p.year_or_title
    from public.profiles p
    where p.role = 'student' and p.id <> v_user_id
      and not private.is_blocked_between(v_user_id, p.id)
      and (p.full_name ilike '%' || v_query || '%' or coalesce(p.department, '') ilike '%' || v_query || '%')
    order by p.full_name limit 20;
end;
$$;

create or replace function public.search_campus_profiles(p_query text)
returns table (user_id uuid, full_name text, role public.user_role, department text, year_or_title text, org_name text)
language plpgsql stable security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_query text := btrim(coalesce(p_query, ''));
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(v_query) < 2 then return; end if;
  return query
    select p.id, p.full_name, p.role, p.department, p.year_or_title, p.org_name
    from public.profiles p
    where p.id <> v_user_id and not private.is_blocked_between(v_user_id, p.id)
      and (p.full_name ilike '%' || v_query || '%' or coalesce(p.department, '') ilike '%' || v_query || '%' or coalesce(p.org_name, '') ilike '%' || v_query || '%')
    order by p.full_name limit 20;
end;
$$;

-- Faculty group management. Membership transitions are serialized by the parent row lock.
create or replace function public.create_faculty_group(p_name text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_group_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = v_user_id and role = 'faculty') then
    raise exception 'Only faculty can create groups';
  end if;
  insert into public.groups(faculty_id, name, description)
  values (v_user_id, btrim(p_name), coalesce(btrim(p_description), '')) returning id into v_group_id;
  return v_group_id;
end;
$$;

create or replace function public.invite_group_student(p_group_id uuid, p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_existing public.group_members%rowtype; v_faculty_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if private.is_blocked_between(v_user_id, p_student_id) then raise exception 'This invitation is unavailable'; end if;
  select faculty_id into v_faculty_id from public.groups where id = p_group_id for update;
  if not found or v_faculty_id <> v_user_id then raise exception 'You do not manage this group'; end if;
  if not exists (select 1 from public.profiles where id = p_student_id and role = 'student') then
    raise exception 'Only students can be invited';
  end if;
  select * into v_existing from public.group_members where group_id = p_group_id and user_id = p_student_id for update;
  if found then
    if v_existing.status in ('pending', 'accepted') then raise exception 'Student already has an active group invitation or membership'; end if;
    update public.group_members set role = 'member', status = 'pending', invited_by = v_user_id, created_at = now()
      where group_id = p_group_id and user_id = p_student_id;
  else
    insert into public.group_members(group_id, user_id, role, status, invited_by)
    values (p_group_id, p_student_id, 'member', 'pending', v_user_id);
  end if;
end;
$$;

create or replace function public.respond_group_invitation(p_group_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_faculty_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('accepted', 'declined') then raise exception 'Invalid decision'; end if;
  select faculty_id into v_faculty_id from public.groups where id = p_group_id;
  if v_faculty_id is null then raise exception 'Group invitation not found'; end if;
  if private.is_blocked_between(v_user_id, v_faculty_id) then raise exception 'This invitation is unavailable'; end if;
  update public.group_members set status = p_decision::public.group_member_status
  where group_id = p_group_id and user_id = v_user_id and role = 'member' and status = 'pending';
  if not found then raise exception 'Group invitation not found'; end if;
end;
$$;

create or replace function public.remove_group_student(p_group_id uuid, p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.groups where id = p_group_id and faculty_id = v_user_id) then
    raise exception 'You do not manage this group';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_student_id and role = 'member';
  if not found then raise exception 'Group member not found'; end if;
end;
$$;

-- Mentorship request workflow. Session row locks serialize both single and bulk acceptance.
create or replace function public.mentorship_available_slots()
returns table (session_id uuid, accepted_count integer, remaining_capacity integer)
language plpgsql stable security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = v_user_id and role = 'student') then return; end if;
  return query
    select ms.id,
      count(mr.id) filter (where mr.status = 'accepted')::integer,
      greatest(ms.capacity - count(mr.id) filter (where mr.status = 'accepted')::integer, 0)::integer
    from public.mentorship_sessions ms
    left join public.mentorship_requests mr on mr.session_id = ms.id
    where ms.status = 'published' and ms.session_date > now()
      and not private.is_blocked_between(v_user_id, ms.faculty_id)
    group by ms.id, ms.capacity;
end;
$$;

create or replace function public.request_mentorship(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_session public.mentorship_sessions%rowtype; v_existing public.mentorship_requests%rowtype; v_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = v_user_id and role = 'student') then
    raise exception 'Only students can request mentorship';
  end if;
  select * into v_session from public.mentorship_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'published' or v_session.session_date <= now() then
    raise exception 'This mentorship session is not open for requests';
  end if;
  if private.is_blocked_between(v_user_id, v_session.faculty_id) then raise exception 'This session is unavailable'; end if;
  select * into v_existing from public.mentorship_requests where session_id = p_session_id and student_id = v_user_id for update;
  if found then
    if v_existing.status in ('pending', 'accepted') then raise exception 'You already have an active request for this session'; end if;
    update public.mentorship_requests set status = 'pending', created_at = now()
      where id = v_existing.id returning id into v_id;
  else
    insert into public.mentorship_requests(session_id, student_id, status)
      values (p_session_id, v_user_id, 'pending') returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.respond_mentorship_request(p_request_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_request public.mentorship_requests%rowtype; v_session public.mentorship_sessions%rowtype; v_session_id uuid; v_accepted integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('accepted', 'declined') then raise exception 'Invalid decision'; end if;
  -- Always lock the session before a request row, matching the bulk action lock order.
  select session_id into v_session_id from public.mentorship_requests where id = p_request_id;
  if not found then raise exception 'Mentorship request is not pending'; end if;
  select * into v_session from public.mentorship_sessions where id = v_session_id for update;
  if not found or v_session.faculty_id <> v_user_id then raise exception 'You do not manage this mentorship session'; end if;
  select * into v_request from public.mentorship_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'Mentorship request is not pending'; end if;
  if private.is_blocked_between(v_user_id, v_request.student_id) then raise exception 'This request is unavailable'; end if;
  if p_decision = 'accepted' then
    if v_session.status <> 'published' or v_session.session_date <= now() then raise exception 'This session is no longer open for acceptance'; end if;
    select count(*) into v_accepted from public.mentorship_requests where session_id = v_session.id and status = 'accepted';
    if v_accepted >= v_session.capacity then raise exception 'Session capacity has been reached'; end if;
  end if;
  update public.mentorship_requests set status = p_decision::public.request_status where id = p_request_id;
end;
$$;

create or replace function public.accept_all_mentorship_requests(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_session public.mentorship_sessions%rowtype; v_accepted integer; v_slots integer; v_changed integer; v_pending integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.mentorship_sessions where id = p_session_id for update;
  if not found or v_session.faculty_id <> v_user_id then raise exception 'You do not manage this mentorship session'; end if;
  if v_session.status <> 'published' or v_session.session_date <= now() then raise exception 'This session is no longer open for acceptance'; end if;
  select count(*) into v_accepted from public.mentorship_requests where session_id = p_session_id and status = 'accepted';
  v_slots := greatest(v_session.capacity - v_accepted, 0);
  if v_slots > 0 then
    with eligible as (
      select id from public.mentorship_requests
      where session_id = p_session_id and status = 'pending'
        and not private.is_blocked_between(v_user_id, student_id)
      order by created_at asc, id asc
      limit v_slots
      for update
    )
    update public.mentorship_requests mr set status = 'accepted'
    from eligible e where mr.id = e.id;
    get diagnostics v_changed = row_count;
  else
    v_changed := 0;
  end if;
  select count(*) into v_pending from public.mentorship_requests where session_id = p_session_id and status = 'pending';
  return jsonb_build_object('accepted_now', v_changed, 'accepted_total', v_accepted + v_changed,
    'remaining_pending', v_pending, 'capacity', v_session.capacity);
end;
$$;

create or replace function public.cancel_mentorship_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_request public.mentorship_requests%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_request from public.mentorship_requests where id = p_request_id for update;
  if not found or v_request.student_id <> v_user_id or v_request.status not in ('pending', 'accepted') then
    raise exception 'Active mentorship request not found';
  end if;
  update public.mentorship_requests set status = 'cancelled' where id = p_request_id;
end;
$$;

-- Profile settings; roles remain immutable. Skill replacement is atomic with the profile update.
create or replace function public.update_my_profile(
  p_full_name text,
  p_department text,
  p_year_or_title text,
  p_org_name text,
  p_organization_info text,
  p_skill_ids uuid[]
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_role public.user_role; v_skills uuid[] := coalesce(p_skill_ids, '{}'::uuid[]);
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 100 then raise exception 'Enter a name between 2 and 100 characters'; end if;
  select role into v_role from public.profiles where id = v_user_id for update;
  if v_role is null then raise exception 'Profile not found'; end if;
  if v_role = 'student' and cardinality(v_skills) = 0 then raise exception 'Select at least one skill'; end if;
  if cardinality(v_skills) <> (select count(distinct x.skill_id) from unnest(v_skills) x(skill_id)) then raise exception 'Duplicate skills are not allowed'; end if;
  if exists (select 1 from unnest(v_skills) x(skill_id) where not exists (select 1 from public.skills s where s.id = x.skill_id)) then
    raise exception 'One or more selected skills do not exist';
  end if;
  update public.profiles set full_name = btrim(p_full_name),
    department = nullif(btrim(coalesce(p_department, '')), ''),
    year_or_title = nullif(btrim(coalesce(p_year_or_title, '')), ''),
    org_name = nullif(btrim(coalesce(p_org_name, '')), ''),
    organization_info = nullif(btrim(coalesce(p_organization_info, '')),'')
  where id = v_user_id;
  if v_role = 'student' then
    delete from public.user_skills where user_id = v_user_id;
    insert into public.user_skills(user_id, skill_id)
      select v_user_id, x.skill_id from unnest(v_skills) x(skill_id);
    -- Keep event-specific offerings consistent when a student removes profile skills.
    update public.event_registrations r
    set skills_offered = array(
      select offered.skill_id from unnest(r.skills_offered) as offered(skill_id)
      where offered.skill_id = any(v_skills)
    )
    where r.user_id = v_user_id and exists (
      select 1 from unnest(r.skills_offered) as offered(skill_id)
      where not offered.skill_id = any(v_skills)
    );
  end if;
end;
$$;

create or replace function public.block_user(p_target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_target_id = v_user_id then raise exception 'You cannot block yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then raise exception 'User not found'; end if;
  insert into public.user_blocks(blocker_id, blocked_id) values (v_user_id, p_target_id) on conflict do nothing;
end;
$$;

create or replace function public.unblock_user(p_target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  delete from public.user_blocks where blocker_id = v_user_id and blocked_id = p_target_id;
end;
$$;

create or replace function public.get_or_create_direct_conversation(p_target_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_a uuid; v_b uuid; v_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not private.can_start_direct(v_user_id, p_target_id) then
    raise exception 'Direct messaging is available only to accepted collaborators';
  end if;
  v_a := least(v_user_id, p_target_id); v_b := greatest(v_user_id, p_target_id);
  insert into public.conversations(kind, created_by, user_a_id, user_b_id)
    values ('direct', v_user_id, v_a, v_b)
    on conflict (user_a_id, user_b_id) where kind = 'direct' do nothing;
  select id into v_id from public.conversations where kind = 'direct' and user_a_id = v_a and user_b_id = v_b;
  insert into public.conversation_members(conversation_id, user_id)
    values (v_id, v_a), (v_id, v_b) on conflict do nothing;
  return v_id;
end;
$$;

-- Row Level Security: deny by default and grant only the operations used by the product.
alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.user_skills enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.partner_requests enable row level security;
alter table public.connections enable row level security;
alter table public.user_blocks enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_upvotes enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.mentorship_sessions enable row level security;
alter table public.mentorship_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_campus on public.profiles for select to authenticated
  using (id = auth.uid()
    or not private.is_blocked_between(auth.uid(), id)
    or exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = id));
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy skills_select_authenticated on public.skills for select to authenticated using (true);
create policy user_skills_select_visible on public.user_skills for select to authenticated
  using (user_id = auth.uid() or not private.is_blocked_between(auth.uid(), user_id));

create policy events_select_campus on public.events for select to authenticated using (true);
create policy events_insert_organizer on public.events for insert to authenticated
  with check (organizer_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'organizer'));
create policy events_update_organizer on public.events for update to authenticated
  using (organizer_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'organizer'))
  with check (organizer_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'organizer'));
create policy events_delete_organizer on public.events for delete to authenticated
  using (organizer_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'organizer'));

create policy event_registrations_select_allowed on public.event_registrations for select to authenticated
  using (private.can_view_event_registration(event_id, user_id, looking_for_teammates, status));

create policy partner_requests_select_participants on public.partner_requests for select to authenticated
  using ((sender_id = auth.uid() or receiver_id = auth.uid()) and not private.is_blocked_between(sender_id, receiver_id));

create policy connections_select_participants on public.connections for select to authenticated
  using ((user_a_id = auth.uid() or user_b_id = auth.uid()) and not private.is_blocked_between(user_a_id, user_b_id));

create policy user_blocks_select_involved on public.user_blocks for select to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

create policy posts_select_campus on public.posts for select to authenticated using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
) and not private.is_blocked_between(auth.uid(), author_id));
create policy posts_insert_self on public.posts for insert to authenticated with check (author_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
));
create policy posts_update_self on public.posts for update to authenticated using (author_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
)) with check (author_id = auth.uid());
create policy posts_delete_self on public.posts for delete to authenticated using (author_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
));

create policy comments_select_campus on public.comments for select to authenticated using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
) and not private.is_blocked_between(auth.uid(), author_id) and exists (
  select 1 from public.posts parent_post
  where parent_post.id = post_id and not private.is_blocked_between(auth.uid(), parent_post.author_id)
));
create policy comments_insert_self on public.comments for insert to authenticated with check (author_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
) and exists (
  select 1 from public.posts parent_post
  where parent_post.id = post_id and not private.is_blocked_between(auth.uid(), parent_post.author_id)
) and (parent_comment_id is null or exists (
  select 1 from public.comments parent_comment
  where parent_comment.id = parent_comment_id
    and parent_comment.post_id = post_id
    and not private.is_blocked_between(auth.uid(), parent_comment.author_id)
)));
create policy comments_update_self on public.comments for update to authenticated using (author_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
)) with check (author_id = auth.uid());
create policy comments_delete_self on public.comments for delete to authenticated using (author_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
));

create policy post_upvotes_select_campus on public.post_upvotes for select to authenticated using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
) and not private.is_blocked_between(auth.uid(), user_id) and exists (
  select 1 from public.posts parent_post
  where parent_post.id = post_id and not private.is_blocked_between(auth.uid(), parent_post.author_id)
));
create policy post_upvotes_insert_self on public.post_upvotes for insert to authenticated with check (user_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
) and exists (
  select 1 from public.posts parent_post
  where parent_post.id = post_id and not private.is_blocked_between(auth.uid(), parent_post.author_id)
));
create policy post_upvotes_delete_self on public.post_upvotes for delete to authenticated using (user_id = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty')
));

create policy groups_select_visible on public.groups for select to authenticated
  using (private.can_view_group(id, auth.uid()));
create policy group_members_select_visible on public.group_members for select to authenticated
  using (user_id = auth.uid() or private.can_view_group(group_id, auth.uid()));

create policy mentorship_sessions_select_published_or_owner on public.mentorship_sessions for select to authenticated
  using ((status = 'published' and not private.is_blocked_between(auth.uid(), faculty_id)) or faculty_id = auth.uid());
create policy mentorship_sessions_insert_faculty on public.mentorship_sessions for insert to authenticated
  with check (faculty_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'faculty'));
create policy mentorship_sessions_update_faculty on public.mentorship_sessions for update to authenticated
  using (faculty_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'faculty'))
  with check (faculty_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'faculty'));
create policy mentorship_sessions_delete_faculty on public.mentorship_sessions for delete to authenticated
  using (faculty_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'faculty'));
create policy mentorship_requests_select_participants on public.mentorship_requests for select to authenticated
  using (student_id = auth.uid() or exists (
    select 1 from public.mentorship_sessions ms where ms.id = session_id and ms.faculty_id = auth.uid()
  ));

create policy conversations_select_participants on public.conversations for select to authenticated
  using (private.can_access_conversation(id, auth.uid()));
create policy conversation_members_select_participants on public.conversation_members for select to authenticated
  using (private.can_access_conversation(conversation_id, auth.uid()));
create policy messages_select_participants on public.messages for select to authenticated
  using (private.can_access_conversation(conversation_id, auth.uid()));
create policy messages_insert_participants on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and private.can_access_conversation(conversation_id, auth.uid()));

create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- API privileges complement RLS. Email is deliberately not selectable via the Data API.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to authenticated;

grant select (id, full_name, role, avatar_url, department, year_or_title, org_name, organization_info, created_at, updated_at) on public.profiles to authenticated;
grant select on public.skills to authenticated;
grant select on public.user_skills to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select on public.event_registrations to authenticated;
grant select on public.partner_requests to authenticated;
grant select on public.connections to authenticated;
grant select on public.user_blocks to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, delete on public.comments to authenticated;
grant select, insert, delete on public.post_upvotes to authenticated;
grant select on public.groups to authenticated;
grant select on public.group_members to authenticated;
grant select, insert, update, delete on public.mentorship_sessions to authenticated;
grant select on public.mentorship_requests to authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function private.has_accepted_connection(uuid, uuid) to authenticated;
grant execute on function private.has_accepted_partner(uuid, uuid) to authenticated;
grant execute on function private.is_group_participant(uuid, uuid) to authenticated;
grant execute on function private.is_mentorship_participant(uuid, uuid) to authenticated;
grant execute on function private.can_start_direct(uuid, uuid) to authenticated;
grant execute on function private.can_access_conversation(uuid, uuid) to authenticated;
grant execute on function private.can_view_group(uuid, uuid) to authenticated;
grant execute on function private.can_view_event_registration(uuid, uuid, boolean, public.registration_status) to authenticated;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.cancel_event_registration(uuid) to authenticated;
grant execute on function public.set_event_interest(uuid, uuid[], uuid[]) to authenticated;
grant execute on function public.find_event_teammates(uuid) to authenticated;
grant execute on function public.send_partner_request(uuid, uuid) to authenticated;
grant execute on function public.respond_partner_request(uuid, text) to authenticated;
grant execute on function public.cancel_partner_request(uuid) to authenticated;
grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid, text) to authenticated;
grant execute on function public.connection_suggestions() to authenticated;
grant execute on function public.search_students(text) to authenticated;
grant execute on function public.search_campus_profiles(text) to authenticated;
grant execute on function public.mentorship_available_slots() to authenticated;
grant execute on function public.create_faculty_group(text, text) to authenticated;
grant execute on function public.invite_group_student(uuid, uuid) to authenticated;
grant execute on function public.respond_group_invitation(uuid, text) to authenticated;
grant execute on function public.remove_group_student(uuid, uuid) to authenticated;
grant execute on function public.request_mentorship(uuid) to authenticated;
grant execute on function public.respond_mentorship_request(uuid, text) to authenticated;
grant execute on function public.accept_all_mentorship_requests(uuid) to authenticated;
grant execute on function public.cancel_mentorship_request(uuid) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- Realtime is limited to user-visible messages and notifications.
alter table public.messages replica identity full;
alter table public.notifications replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
  end if;
end;
$$;
