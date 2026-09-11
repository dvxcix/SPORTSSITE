create table if not exists public.browser_automation_leases (
  lease_key text primary key,
  owner_id uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.browser_automation_leases enable row level security;
revoke all on table public.browser_automation_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.browser_automation_leases to service_role;

create or replace function public.try_acquire_browser_automation_lease(
  p_lease_key text,
  p_owner_id uuid,
  p_ttl_seconds integer default 360
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  with claimed as (
    insert into public.browser_automation_leases (lease_key, owner_id, expires_at, updated_at)
    values (
      p_lease_key,
      p_owner_id,
      now() + make_interval(secs => greatest(30, least(p_ttl_seconds, 900))),
      now()
    )
    on conflict (lease_key) do update
      set owner_id = excluded.owner_id,
          expires_at = excluded.expires_at,
          updated_at = now()
      where public.browser_automation_leases.expires_at <= now()
         or public.browser_automation_leases.owner_id = excluded.owner_id
    returning true as acquired
  )
  select coalesce((select acquired from claimed limit 1), false);
$function$;

create or replace function public.release_browser_automation_lease(
  p_lease_key text,
  p_owner_id uuid,
  p_cooldown_seconds integer default 8
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  with released as (
    update public.browser_automation_leases
       set expires_at = now() + make_interval(secs => greatest(5, least(p_cooldown_seconds, 30))),
           updated_at = now()
     where lease_key = p_lease_key
       and owner_id = p_owner_id
    returning true as released
  )
  select coalesce((select released from released limit 1), false);
$function$;

revoke execute on function public.try_acquire_browser_automation_lease(text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_browser_automation_lease(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.try_acquire_browser_automation_lease(text, uuid, integer) to service_role;
grant execute on function public.release_browser_automation_lease(text, uuid, integer) to service_role;
