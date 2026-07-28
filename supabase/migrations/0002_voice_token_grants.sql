-- Per-user quota for Realtime voice sessions.
--
-- Edge Functions are stateless and horizontally scaled, so an in-memory counter
-- would reset on every cold start and be bypassed by concurrent instances. The
-- quota therefore lives in Postgres, where the check and the insert happen in a
-- single statement-level transaction.

create table if not exists public.voice_token_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists voice_token_grants_user_created_idx
  on public.voice_token_grants (user_id, created_at desc);

-- RLS on with no policies at all: unreachable from the anon and authenticated
-- roles. Only the service role, used exclusively by the Edge Function, touches it.
alter table public.voice_token_grants enable row level security;

create or replace function public.claim_voice_token(
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
  delete from public.voice_token_grants where created_at < now() - interval '1 day';

  select count(*) into recent
  from public.voice_token_grants
  where user_id = p_user_id
    and created_at > now() - p_window;

  if recent >= p_limit then
    return false;
  end if;

  insert into public.voice_token_grants (user_id) values (p_user_id);
  return true;
end;
$$;

-- Callable only by the service role. A signed-in user must never be able to
-- invoke this directly and mint themselves extra quota.
revoke all on function public.claim_voice_token(uuid, interval, integer) from public;
revoke all on function public.claim_voice_token(uuid, interval, integer) from anon;
revoke all on function public.claim_voice_token(uuid, interval, integer) from authenticated;
grant execute on function public.claim_voice_token(uuid, interval, integer) to service_role;
