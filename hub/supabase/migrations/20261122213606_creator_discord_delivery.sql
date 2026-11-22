-- Creator-owned Discord access. All writes and provider identities remain server-owned.
do $$begin
 if to_regclass('public.creator_entitlements') is null or to_regclass('public.groups') is null then raise exception 'Creator baseline missing'; end if;
end $$;

create table public.creator_discord_integrations (
 id uuid primary key default gen_random_uuid(),
 group_id uuid references public.groups(id) on delete set null,
 creator_id uuid references public.users(id) on delete set null,
 guild_id text not null check(guild_id ~ '^\d{17,22}$'),
 guild_name text not null,
 role_id text not null check(role_id ~ '^\d{17,22}$'),
 role_name text not null,
 invite_url text,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 unique(guild_id,role_id)
);
create unique index creator_discord_group_active on public.creator_discord_integrations(group_id) where enabled;
create index creator_discord_creator_idx on public.creator_discord_integrations(creator_id);
alter table public.creator_discord_integrations enable row level security;
revoke all on public.creator_discord_integrations from anon,authenticated;
grant all on public.creator_discord_integrations to service_role;

create table public.creator_discord_jobs (
 id uuid primary key default gen_random_uuid(),
 integration_id uuid not null references public.creator_discord_integrations(id) on delete cascade,
 user_id uuid references public.users(id) on delete set null,
 assigned_discord_id text,
 version bigint not null default 1,
 attempts integer not null default 0,
 pending boolean not null default true,
 run_after timestamptz not null default now(),
 locked_until timestamptz,
 last_success_at timestamptz,
 unique(integration_id,user_id)
);
create index creator_discord_jobs_due on public.creator_discord_jobs(run_after) where pending;
create index creator_discord_jobs_user on public.creator_discord_jobs(user_id);
alter table public.creator_discord_jobs enable row level security;
revoke all on public.creator_discord_jobs from anon,authenticated;
grant all on public.creator_discord_jobs to service_role;

create function public.queue_creator_discord(p_group_id uuid,p_user_id uuid)
returns void language sql security invoker set search_path=pg_catalog,public as $$
 insert into public.creator_discord_jobs(integration_id,user_id)
 select id,p_user_id from public.creator_discord_integrations where group_id=p_group_id
 on conflict(integration_id,user_id) do update set pending=true,version=creator_discord_jobs.version+1,run_after=now(),attempts=0;
$$;

create function public.enqueue_creator_discord_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_user uuid; v_group uuid;
begin
 if tg_table_name='creator_entitlements' then
  for v_group in select id from public.groups where creator_product_id=new.product_id loop perform public.queue_creator_discord(v_group,new.user_id); end loop;
 elsif tg_table_name='users' then
  if new.discord_id is distinct from old.discord_id then
   for v_group in select group_id from public.group_members where user_id=new.id union select i.group_id from public.creator_discord_jobs j join public.creator_discord_integrations i on i.id=j.integration_id where j.user_id=new.id loop perform public.queue_creator_discord(v_group,new.id); end loop;
  end if;
 else
  if tg_op='DELETE' then v_user:=old.user_id;v_group:=old.group_id;else v_user:=new.user_id;v_group:=new.group_id;end if;
  perform public.queue_creator_discord(v_group,v_user);
 end if;
 return null;
end $$;
create trigger creator_discord_entitlement after insert or update of status,current_period_end,admin_revoked_at on public.creator_entitlements for each row execute function public.enqueue_creator_discord_change();
create trigger creator_discord_group_member after insert or delete on public.group_members for each row execute function public.enqueue_creator_discord_change();
create trigger creator_discord_identity after update of discord_id on public.users for each row execute function public.enqueue_creator_discord_change();

create function public.creator_discord_access(p_integration_id uuid,p_user_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('guild_id',i.guild_id,'role_id',i.role_id,'discord_id',u.discord_id,'allowed',
  coalesce(i.enabled and (g.owner_id=p_user_id or (
   exists(select 1 from public.group_members gm where gm.group_id=g.id and gm.user_id=p_user_id)
   and (g.access_type='free' or exists(select 1 from public.creator_entitlements ce where ce.product_id=g.creator_product_id and ce.user_id=p_user_id and ce.status in('active','trialing') and ce.admin_revoked_at is null and (ce.current_period_end is null or ce.current_period_end>now())))
  )),false))
 from public.creator_discord_integrations i left join public.groups g on g.id=i.group_id left join public.users u on u.id=p_user_id where i.id=p_integration_id;
$$;

create function public.enqueue_creator_discord_integration_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 update public.creator_discord_jobs set pending=true,version=version+1,run_after=now(),attempts=0 where integration_id=new.id;
 return null;
end $$;
create trigger creator_discord_integration_change after update of group_id,creator_id,enabled on public.creator_discord_integrations for each row execute function public.enqueue_creator_discord_integration_change();
revoke all on function public.enqueue_creator_discord_integration_change() from public,anon,authenticated;

create function public.claim_creator_discord_jobs(p_limit integer default 8,p_user uuid default null,p_integration uuid default null)
returns setof public.creator_discord_jobs language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if current_user<>'service_role' then raise exception using errcode='42501',message='service only';end if;
 -- Expiry is clock-driven even when Whop sends no event; assigned roles are periodically rechecked.
 update public.creator_discord_jobs set pending=true,run_after=now(),version=version+1
 where not pending and assigned_discord_id is not null and last_success_at<now()-interval '5 minutes';
 return query with due as (
  select id from public.creator_discord_jobs where pending and run_after<=now() and (p_user is null or user_id=p_user) and (p_integration is null or integration_id=p_integration) and (locked_until is null or locked_until<now()) order by run_after for update skip locked limit greatest(1,least(p_limit,20))
 ) update public.creator_discord_jobs j set locked_until=now()+interval '5 minutes' from due where j.id=due.id returning j.*;
end $$;

create function public.finish_creator_discord_job(p_id uuid,p_version bigint,p_success boolean,p_discord_id text)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if current_user<>'service_role' then raise exception using errcode='42501',message='service only';end if;
 update public.creator_discord_jobs set
  locked_until=null,
  pending=case when version<>p_version then true else not p_success end,
  assigned_discord_id=case when p_success then p_discord_id else assigned_discord_id end,
  attempts=case when p_success then 0 else attempts+1 end,
  run_after=case when version<>p_version or p_success then now() else now()+least(interval '1 hour',interval '30 seconds'*power(2,least(attempts,7))) end,
  last_success_at=case when p_success then now() else last_success_at end
 where id=p_id;
end $$;

-- Immutable mappings keep old-role revocations in the queue when a creator changes servers or roles.
create function public.configure_creator_discord(p_creator uuid,p_group uuid,p_guild text,p_guild_name text,p_role text,p_role_name text,p_invite text)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_id uuid;v_user uuid;
begin
 if current_user<>'service_role' or not exists(select 1 from public.groups where id=p_group and owner_id=p_creator) then raise exception using errcode='42501',message='owner only';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_group::text,1));
 update public.creator_discord_integrations set enabled=false where group_id=p_group and enabled;
 if p_guild is not null then
  if exists(select 1 from public.creator_discord_integrations where guild_id=p_guild and role_id=p_role and group_id<>p_group) then raise exception 'Use a separate membership role for this community';end if;
  insert into public.creator_discord_integrations(group_id,creator_id,guild_id,guild_name,role_id,role_name,invite_url)
  values(p_group,p_creator,p_guild,p_guild_name,p_role,p_role_name,p_invite)
  on conflict(guild_id,role_id) do update set group_id=excluded.group_id,creator_id=excluded.creator_id,enabled=true,guild_name=excluded.guild_name,role_name=excluded.role_name,invite_url=excluded.invite_url returning id into v_id;
 end if;
 for v_user in select user_id from public.group_members where group_id=p_group union select j.user_id from public.creator_discord_jobs j join public.creator_discord_integrations i on i.id=j.integration_id where i.group_id=p_group loop perform public.queue_creator_discord(p_group,v_user);end loop;
 return v_id;
end $$;

revoke all on function public.queue_creator_discord(uuid,uuid),public.enqueue_creator_discord_change(),public.creator_discord_access(uuid,uuid),public.claim_creator_discord_jobs(integer,uuid,uuid),public.finish_creator_discord_job(uuid,bigint,boolean,text),public.configure_creator_discord(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.queue_creator_discord(uuid,uuid),public.creator_discord_access(uuid,uuid),public.claim_creator_discord_jobs(integer,uuid,uuid),public.finish_creator_discord_job(uuid,bigint,boolean,text),public.configure_creator_discord(uuid,uuid,text,text,text,text,text) to service_role;

-- Retire the unused local percentage. The account's existing Whop fee policy is untouched.
update public.platform_settings set value='0'::jsonb,updated_at=now() where key='fee_independent_creator_pct';
revoke execute on function public.creator_admin_update_fee(uuid,numeric,timestamptz) from service_role;

-- Membership side effects follow the persisted newest state, including an admin access hold.
create or replace function public.apply_creator_membership(p_event_id text,p_event_type text,p_product_id uuid,p_creator_id uuid,p_user_id uuid,p_membership_id text,p_object_id text,p_account_id text,p_plan_id text,p_status text,p_period_end timestamptz,p_provider_updated_at timestamptz,p_amount numeric default null,p_currency text default 'usd')
returns void language plpgsql set search_path=pg_catalog,public as $$
declare v_existing public.creator_entitlements%rowtype;
begin
 if current_user<>'service_role' then raise exception using errcode='42501',message='service only'; end if;
 if p_provider_updated_at is null then raise exception 'membership version unavailable'; end if;
 if p_membership_id!~'^mem_[A-Za-z0-9]+$' or p_status not in('active','trialing','past_due','expired','canceled','revoked') then raise exception 'invalid membership'; end if;
 if not exists(select 1 from public.creator_products cp join public.users u on u.id=cp.creator_id where cp.id=p_product_id and cp.creator_id=p_creator_id and cp.whop_plan_id=p_plan_id and u.whop_connected_company_id=p_account_id) then raise exception 'creator product mapping mismatch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_membership_id,0));
 select * into v_existing from public.creator_entitlements where whop_membership_id=p_membership_id;
 if found and (v_existing.user_id<>p_user_id or v_existing.product_id<>p_product_id) then raise exception 'membership owner mismatch'; end if;
 if exists(select 1 from public.creator_entitlements where user_id=p_user_id and product_id=p_product_id and whop_membership_id is distinct from p_membership_id and status in('active','trialing') and (current_period_end is null or current_period_end>now())) then raise exception 'another active membership needs reconciliation'; end if;
 insert into public.creator_commerce_events(creator_id,product_id,event_type,provider_event_id,provider_object_id,amount,currency,status,metadata)
 values(p_creator_id,p_product_id,p_event_type,p_event_id,p_object_id,p_amount,p_currency,p_status,jsonb_build_object('membership_id',p_membership_id))
 on conflict do nothing;
 insert into public.creator_entitlements(user_id,creator_id,product_id,whop_membership_id,status,current_period_end,provider_updated_at,updated_at)
 values(p_user_id,p_creator_id,p_product_id,p_membership_id,p_status,p_period_end,p_provider_updated_at,now())
 on conflict(user_id,product_id) do update set whop_membership_id=excluded.whop_membership_id,status=excluded.status,current_period_end=excluded.current_period_end,provider_updated_at=excluded.provider_updated_at,updated_at=now()
 where creator_entitlements.provider_updated_at is null or excluded.provider_updated_at>=creator_entitlements.provider_updated_at;
 select * into v_existing from public.creator_entitlements where user_id=p_user_id and product_id=p_product_id;
 if v_existing.status in('active','trialing') and v_existing.admin_revoked_at is null and (v_existing.current_period_end is null or v_existing.current_period_end>now()) then
  insert into public.group_members(group_id,user_id,role) select g.id,p_user_id,'member' from public.groups g where g.creator_product_id=p_product_id on conflict(group_id,user_id) do nothing;
  insert into public.channel_members(channel_id,user_id) select c.id,p_user_id from public.channels c where c.creator_product_id=p_product_id on conflict(channel_id,user_id) do nothing;
 end if;
end $$;
