-- Per-user quota for job-link imports.
--
-- Same reasoning as voice_token_grants: Edge Functions are stateless and
-- horizontally scaled, so an in-memory counter would reset on every cold start
-- and be bypassed by concurrent instances. A separate table keeps an import
-- from eating into the voice quota, since the two spend very different amounts.

create table if not exists public.job_link_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists job_link_grants_user_created_idx
  on public.job_link_grants (user_id, created_at desc);

-- RLS on with no policies at all: unreachable from the anon and authenticated
-- roles. Only the service role, used exclusively by the Edge Function, touches it.
alter table public.job_link_grants enable row level security;

create or replace function public.claim_job_link(
  p_user_id uuid,
  p_window interval,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent integer;
begin
  -- Opportunistic cleanup; grants older than a day can never affect a decision.
  delete from public.job_link_grants where created_at < now() - interval '1 day';

  select count(*) into recent
  from public.job_link_grants
  where user_id = p_user_id
    and created_at > now() - p_window;

  if recent >= p_limit then
    return false;
  end if;

  insert into public.job_link_grants (user_id) values (p_user_id);
  return true;
end;
$$;

-- Callable only by the service role. A signed-in user must never be able to
-- invoke this directly and mint themselves extra quota.
revoke all on function public.claim_job_link(uuid, interval, integer) from public;
revoke all on function public.claim_job_link(uuid, interval, integer) from anon;
revoke all on function public.claim_job_link(uuid, interval, integer) from authenticated;
grant execute on function public.claim_job_link(uuid, interval, integer) to service_role;
