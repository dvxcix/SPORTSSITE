-- Self-service free communities and verified paid access. No historical migration replay.
-- User explicitly requested free hosted communities and selected self-service paid setup on 2026-11-22.
-- Compatibility proof: exact live catalog + grants + RLS in isolated PGlite, 11 scenarios passed.
-- Existing global public/private chat and protected provider columns verified unchanged.
-- Fail closed if this previously empty feature has acquired data or baseline functions have changed.
set lock_timeout='3s';
set statement_timeout='30s';

do $$ begin
  if to_regprocedure('public.create_community_group(text,text,text,text,text,boolean,uuid)') is null
     or to_regprocedure('private.can_view_group(uuid,uuid)') is null
     or to_regprocedure('private.can_access_channel(uuid,uuid)') is null
     or md5(pg_get_functiondef('private.can_view_group(uuid,uuid)'::regprocedure))<>'347d1636c3914c2a3e9fe658a33c8403'
     or md5(pg_get_functiondef('private.can_access_channel(uuid,uuid)'::regprocedure))<>'b057fb001e943f2e192c0dae173deebc'
     or md5(pg_get_functiondef('public.create_community_group(text,text,text,text,text,boolean,uuid)'::regprocedure))<>'f3f4e789214b2bb1a9a1d568374d6601'
     or exists(select 1 from public.creator_entitlements where whop_membership_id is not null group by whop_membership_id having count(*)>1)
     or exists(select 1 from public.groups)
     or exists(select 1 from public.creator_products)
     or exists(select 1 from public.creator_entitlements)
  then raise exception 'Creator community preflight failed'; end if;
end $$;

alter table public.creator_entitlements add column if not exists provider_updated_at timestamptz;
-- A provider membership cannot be reassigned to another SlipSurge buyer.
create unique index if not exists creator_entitlements_membership_unique on public.creator_entitlements(whop_membership_id) where whop_membership_id is not null;
create unique index if not exists creator_products_plan_unique on public.creator_products(whop_plan_id) where whop_plan_id is not null;

create or replace function private.can_view_group(p_group_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select p_user_id is not null and p_user_id=(select auth.uid()) and exists(
   select 1 from public.groups g where g.id=p_group_id and (
     g.owner_id=p_user_id
     or (g.access_type='free' and (g.is_public or exists(select 1 from public.group_members gm where gm.group_id=g.id and gm.user_id=p_user_id)))
     or (g.access_type='paid' and exists(select 1 from public.creator_entitlements ce where ce.product_id=g.creator_product_id and ce.user_id=p_user_id and ce.status in('active','trialing') and (ce.current_period_end is null or ce.current_period_end>now())))
   )
 );
$$;

create or replace function private.is_group_member(p_group_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select p_user_id is not null and p_user_id=(select auth.uid())
   and exists(select 1 from public.group_members gm where gm.group_id=p_group_id and gm.user_id=p_user_id)
   and private.can_view_group(p_group_id,p_user_id);
$$;

create or replace function private.can_access_channel(target_channel_id uuid,viewer_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private as $$
 select viewer_id is not null and viewer_id=(select auth.uid()) and exists(
  select 1 from public.channels c where c.id=target_channel_id and (
   c.owner_id=viewer_id or (
    (c.creator_product_id is null or exists(select 1 from public.creator_entitlements ce where ce.product_id=c.creator_product_id and ce.user_id=viewer_id and ce.status in('active','trialing') and (ce.current_period_end is null or ce.current_period_end>now())))
    and (c.group_id is null or private.can_view_group(c.group_id,viewer_id))
    and ((c.channel_type='public' and c.creator_product_id is null)
      or exists(select 1 from public.channel_members cm where cm.channel_id=c.id and cm.user_id=viewer_id)
      or private.is_group_member(c.group_id,viewer_id)
      or exists(select 1 from public.creator_entitlements ce where ce.product_id=c.creator_product_id and ce.user_id=viewer_id and ce.status in('active','trialing') and (ce.current_period_end is null or ce.current_period_end>now())))
    and (c.group_id is null or not private.is_group_member(c.group_id,viewer_id) or private.community_channel_permission(c.id,viewer_id,'view_channels'))
   )
  )
 );
$$;

-- Restrictive gates coexist with existing discovery, two-way blocks, tier redaction and offseason rules.
create policy "Community posts require current group access" on public.posts as restrictive for select to anon,authenticated
using (case when (select auth.uid()) is null then group_id is null else group_id is null or author_id=(select auth.uid()) or (
  private.can_view_group(group_id,(select auth.uid()))
  and exists(select 1 from public.groups g where g.id=posts.group_id and ((g.access_type='free' and g.is_public) or private.is_group_member(g.id,(select auth.uid()))))
) end);
create policy "Paid channel metadata requires current access" on public.channels as restrictive for select to anon,authenticated
using (case when (select auth.uid()) is null then creator_product_id is null else creator_product_id is null or owner_id=(select auth.uid()) or private.can_access_channel(id,(select auth.uid())) end);
create policy "Paid group joins require entitlement" on public.group_members as restrictive for insert to authenticated
with check (exists(select 1 from public.groups g where g.id=group_id and (g.owner_id=(select auth.uid()) or g.access_type='free' or private.can_view_group(g.id,(select auth.uid())))));
create policy "Paid channel joins require entitlement" on public.channel_members as restrictive for insert to authenticated
with check (exists(select 1 from public.channels c where c.id=channel_id and (c.owner_id=(select auth.uid()) or c.creator_product_id is null or private.can_access_channel(c.id,(select auth.uid())))));

-- Read only the signed-in owner's readiness; private provider columns retain their grants.
create or replace function private.creator_offer_ready(p_product_id uuid,p_owner_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select (p_owner_id=(select auth.uid()) or (select auth.role())='service_role') and exists(
  select 1 from public.creator_products cp join public.users u on u.id=cp.creator_id
  where cp.id=p_product_id and cp.creator_id=p_owner_id and cp.status in('draft','active','paused')
  and cp.whop_plan_id is not null and u.whop_connected_company_id is not null and u.creator_commerce_status='ready'
 );
$$;
revoke all on function private.creator_offer_ready(uuid,uuid) from public,anon;
grant execute on function private.creator_offer_ready(uuid,uuid) to authenticated,service_role;

-- Invoker guard prevents direct table writes bypassing the paid setup flow.
create or replace function private.validate_community_commerce()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if (new.access_type='paid') is distinct from (new.creator_product_id is not null) then
  raise exception using errcode='22023',message='invalid community access';
 end if;
 if new.creator_product_id is not null and not private.creator_offer_ready(new.creator_product_id,new.owner_id) then raise exception using errcode='42501',message='verified creator offer required'; end if;
 -- Do not silently turn an existing free community into a paid one or detach a paid product.
 if tg_op='UPDATE' and (old.creator_product_id is distinct from new.creator_product_id or old.access_type is distinct from new.access_type)
 then raise exception using errcode='42501',message='create a dedicated member community for a new offer'; end if;
 return new;
end $$;
revoke all on function private.validate_community_commerce() from public,anon,authenticated;
create trigger validate_community_commerce before insert or update of creator_product_id,access_type,owner_id on public.groups for each row execute function private.validate_community_commerce();

-- Bind group content to the group's paid product; clients cannot omit the access marker.
create or replace function private.bind_community_post_access()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_product uuid; v_owner uuid;
begin
 if new.group_id is not null then
  select g.creator_product_id,g.owner_id into v_product,v_owner from public.groups g where g.id=new.group_id;
  if not found or ((select auth.uid()) is not null and not private.is_group_member(new.group_id,(select auth.uid())) and v_owner<>(select auth.uid()))
   then raise exception using errcode='42501',message='community membership required'; end if;
  new.creator_product_id:=v_product;
 end if;
 return new;
end $$;
revoke all on function private.bind_community_post_access() from public,anon,authenticated;
create trigger bind_community_post_access before insert or update of group_id,creator_product_id on public.posts for each row execute function private.bind_community_post_access();

create or replace function public.create_community_group(p_name text,p_slug text,p_description text default null,p_sport text default null,p_emoji text default '👥',p_is_public boolean default true,p_creator_product_id uuid default null)
returns table(group_id uuid,group_slug text,channel_id uuid,channel_slug text)
language plpgsql set search_path=pg_catalog,public as $$
declare v_user_id uuid:=auth.uid(); v_group_id uuid; v_channel_id uuid; v_channel_slug text:='group-'||p_slug;
begin
 if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;
 if not private.check_rate_limit('community-create:'||v_user_id::text,10,3600) then raise exception using errcode='54000',message='community creation limit reached'; end if;
 if p_name is null or length(btrim(p_name))<2 or length(btrim(p_name))>60 or p_slug is null or p_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug)>70
 or length(p_description)>280 or p_emoji is null or length(p_emoji)>16 or length(p_sport)>32
 then raise exception using errcode='22023',message='invalid community details'; end if;
 if p_creator_product_id is not null and not private.creator_offer_ready(p_creator_product_id,v_user_id)
 then raise exception using errcode='42501',message='membership unavailable'; end if;
 insert into public.groups(name,slug,description,sport,emoji,is_public,owner_id,access_type,creator_product_id)
 values(btrim(p_name),p_slug,nullif(btrim(p_description),''),nullif(btrim(p_sport),''),p_emoji,p_is_public,v_user_id,case when p_creator_product_id is null then 'free' else 'paid' end,p_creator_product_id) returning id into v_group_id;
 insert into public.group_members(group_id,user_id,role) values(v_group_id,v_user_id,'owner');
 insert into public.channels(name,slug,description,icon,channel_type,owner_id,member_count,group_id,creator_product_id)
 values(btrim(p_name),v_channel_slug,nullif(btrim(p_description),''),p_emoji,case when p_is_public then 'public' else 'members_only' end,v_user_id,1,v_group_id,p_creator_product_id) returning id into v_channel_id;
 insert into public.channel_members(channel_id,user_id) values(v_channel_id,v_user_id);
 update public.groups set channel_id=v_channel_id where id=v_group_id;
 return query select v_group_id,p_slug,v_channel_id,v_channel_slug;
end $$;
revoke all on function public.create_community_group(text,text,text,text,text,boolean,uuid) from public,anon;
grant execute on function public.create_community_group(text,text,text,text,text,boolean,uuid) to authenticated;

create unique index if not exists creator_commerce_payment_unique on public.creator_commerce_events(provider,provider_object_id) where event_type='payment.succeeded' and provider_object_id is not null;

-- Service-only transaction: ledger + entitlement + community enrollment succeed or retry together.
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
 if p_status in('active','trialing') and (p_period_end is null or p_period_end>now()) then
  insert into public.group_members(group_id,user_id,role) select g.id,p_user_id,'member' from public.groups g where g.creator_product_id=p_product_id on conflict(group_id,user_id) do nothing;
  insert into public.channel_members(channel_id,user_id) select c.id,p_user_id from public.channels c where c.creator_product_id=p_product_id on conflict(channel_id,user_id) do nothing;
 end if;
end $$;
revoke all on function public.apply_creator_membership(text,text,uuid,uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,numeric,text) from public,anon,authenticated;
grant execute on function public.apply_creator_membership(text,text,uuid,uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,numeric,text) to service_role;

alter table public.creator_scheduled_posts add column if not exists group_id uuid references public.groups(id) on delete cascade;
create index if not exists creator_scheduled_posts_group_idx on public.creator_scheduled_posts(group_id) where group_id is not null;

-- Provider signing material is encrypted by the server and never granted to API users.
create table public.creator_provider_connections(
 provider text primary key check(provider='whop'),
 account_id text not null,
 webhook_id text not null,
 secret_ciphertext text not null,
 updated_at timestamptz not null default now()
);
alter table public.creator_provider_connections enable row level security;
revoke all on public.creator_provider_connections from public,anon,authenticated;
grant select,insert,update on public.creator_provider_connections to service_role;

notify pgrst,'reload schema';
