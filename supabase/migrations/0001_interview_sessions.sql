-- LEGACY: saved reports were removed along with accounts. This table is no
-- longer read or written by the app and can be dropped. Kept because it has
-- already been applied.

-- Completed interview reports, one row per finished practice session.
--
-- Row Level Security is the security boundary for this app: the browser ships
-- only the publishable anon key, and every policy below scopes rows to
-- auth.uid(). Without a signed-in JWT the anon key can read and write nothing.

create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  interview_type text not null,
  duration integer not null,
  sample_mode boolean not null default false,
  score integer,
  report jsonb not null,
  transcript jsonb not null
);

create index if not exists interview_sessions_user_created_idx
  on public.interview_sessions (user_id, created_at desc);

alter table public.interview_sessions enable row level security;

-- Deny by default: with RLS on and no permissive policy, nothing is readable.
drop policy if exists "Users read their own sessions" on public.interview_sessions;
create policy "Users read their own sessions"
  on public.interview_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own sessions" on public.interview_sessions;
create policy "Users insert their own sessions"
  on public.interview_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own sessions" on public.interview_sessions;
create policy "Users delete their own sessions"
  on public.interview_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Reports are immutable once written; there is deliberately no update policy.
