-- Approved and applied individually to SlipSurge production; do not replay historical migrations.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
do $guard$ begin
 if to_regclass('public.feature_rollouts') is not null then raise exception 'Repair precondition failed: feature_rollouts already exists; reconcile schema first'; end if;
 if to_regclass('public.feature_rollout_overrides') is not null then raise exception 'Repair precondition failed: feature_rollout_overrides already exists; reconcile schema first'; end if;
end $guard$;
create table if not exists public.feature_rollouts (
  feature_key text primary key check (feature_key ~ '^feature_[a-z0-9_]{2,80}$'),
  audience text not null default 'everyone' check (audience in ('off', 'admins', 'members', 'percentage', 'everyone')),
  rollout_percent smallint not null default 100 check (rollout_percent between 0 and 100),
  rollout_salt uuid not null default gen_random_uuid(),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_rollout_overrides (
  feature_key text not null references public.feature_rollouts(feature_key) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  enabled boolean not null,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (feature_key, user_id)
);

create index if not exists feature_rollout_overrides_user_idx
  on public.feature_rollout_overrides(user_id, feature_key);

alter table public.feature_rollouts enable row level security;
alter table public.feature_rollout_overrides enable row level security;

create policy "Admins read feature rollouts"
on public.feature_rollouts for select to authenticated
using (
  exists (
    select 1 from public.users member
    where member.id = (select auth.uid()) and member.account_type = 'admin'
  )
);

create policy "Admins read feature rollout overrides"
on public.feature_rollout_overrides for select to authenticated
using (
  exists (
    select 1 from public.users member
    where member.id = (select auth.uid()) and member.account_type = 'admin'
  )
);

revoke all on public.feature_rollouts from public, anon, authenticated;
revoke all on public.feature_rollout_overrides from public, anon, authenticated;
grant select on public.feature_rollouts to authenticated;
grant select on public.feature_rollout_overrides to authenticated;

do $flags$ begin
 if (select count(*) from public.site_settings where key in ('feature_marketplace','feature_pages','feature_blog','feature_forum','feature_groups','feature_events','feature_stories','feature_polls','feature_watchlist') and value in ('true','false')) <> 9 then
   raise exception 'Missing or nonboolean legacy flags; review before seeding rollouts';
 end if;
end $flags$;
insert into public.feature_rollouts(feature_key,audience,rollout_percent)
select key, case when value='true' then 'everyone' else 'off' end,
 case when value='true' then 100 else 0 end
from public.site_settings where key in ('feature_marketplace','feature_pages','feature_blog','feature_forum','feature_groups','feature_events','feature_stories','feature_polls','feature_watchlist');

grant all on table public.feature_rollouts to service_role;
grant all on table public.feature_rollout_overrides to service_role;
commit;
