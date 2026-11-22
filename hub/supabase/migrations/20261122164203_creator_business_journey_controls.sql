-- Additive repair only. Existing offers, rates, memberships and flags are preserved.
do $$begin
 if to_regprocedure('public.apply_creator_membership(text,text,uuid,uuid,uuid,text,text,text,text,text,timestamp with time zone,timestamp with time zone,numeric,text)') is null
  or not exists(select 1 from public.platform_settings where key='fee_independent_creator_pct')
  or not exists(select 1 from pg_policies where schemaname='public' and tablename='groups' and policyname='Group owners read own groups') then
  raise exception 'Creator commerce baseline unavailable';
 end if;
end $$;
alter table public.creator_entitlements
 add column if not exists admin_revoked_at timestamptz,
 add column if not exists admin_revoked_by uuid references public.users(id) on delete set null,
 add column if not exists admin_revoked_reason text;

create or replace function public.keep_creator_access_hold()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.admin_revoked_at is not null then new.status:='revoked'; end if;
 return new;
end $$;
revoke all on function public.keep_creator_access_hold() from public,anon,authenticated;
grant execute on function public.keep_creator_access_hold() to service_role;
drop trigger if exists keep_creator_access_hold on public.creator_entitlements;
create trigger keep_creator_access_hold before insert or update on public.creator_entitlements
 for each row execute function public.keep_creator_access_hold();

create or replace function public.creator_admin_update_fee(p_actor uuid,p_value numeric,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_setting public.platform_settings%rowtype; v_now timestamptz:=clock_timestamp();
begin
 if current_user<>'service_role' or not exists(select 1 from public.users where id=p_actor and account_type='admin') then raise exception using errcode='42501',message='admin only'; end if;
 if p_value is null or p_value<0 or p_value>=100 or p_value<>round(p_value,2) or p_expected_updated_at is null then raise exception using errcode='22023',message='invalid creator fee'; end if;
 select * into v_setting from public.platform_settings where key='fee_independent_creator_pct' for update;
 if not found then raise exception 'creator fee configuration unavailable'; end if;
 if v_setting.updated_at<>p_expected_updated_at then raise exception using errcode='40001',message='creator fee changed'; end if;
 if v_setting.value<>to_jsonb(p_value) then
  update public.platform_settings set value=to_jsonb(p_value),updated_at=v_now where key=v_setting.key;
  insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details)
  values(p_actor,'creator.platform_fee_changed','platform_setting',v_setting.key,jsonb_build_object('previous',v_setting.value,'value',p_value,'applies_to','newly_saved_offers'));
 else v_now:=v_setting.updated_at;
 end if;
 return jsonb_build_object('value',p_value,'updated_at',v_now);
end $$;
revoke all on function public.creator_admin_update_fee(uuid,numeric,timestamptz) from public,anon,authenticated;
grant execute on function public.creator_admin_update_fee(uuid,numeric,timestamptz) to service_role;

create or replace function public.creator_admin_access_hold(p_id uuid,p_actor uuid,p_hold boolean,p_reason text,p_provider_status text default null,p_period_end timestamptz default null,p_provider_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_row public.creator_entitlements%rowtype; v_key text;
begin
 if current_user<>'service_role' or not exists(select 1 from public.users where id=p_actor and account_type='admin') then raise exception using errcode='42501',message='admin only'; end if;
 if p_hold is null or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception using errcode='22023',message='management reason required'; end if;
 select coalesce(whop_membership_id,id::text) into v_key from public.creator_entitlements where id=p_id;
 if not found then raise exception using errcode='P0002',message='membership not found'; end if;
 -- Same lock order as apply_creator_membership: provider identity, then row.
 perform pg_advisory_xact_lock(hashtextextended(v_key,0));
 select * into v_row from public.creator_entitlements where id=p_id for update;
 if not p_hold and (p_provider_status is null or p_provider_status not in('active','trialing','expired','canceled','past_due','revoked') or p_provider_updated_at is null) then raise exception using errcode='22023',message='current provider state required'; end if;
 if not p_hold and v_row.provider_updated_at>p_provider_updated_at then raise exception using errcode='40001',message='membership changed; refresh provider state'; end if;
 update public.creator_entitlements set
  admin_revoked_at=case when p_hold then now() else null end,
  admin_revoked_by=case when p_hold then p_actor else null end,
  admin_revoked_reason=case when p_hold then trim(p_reason) else null end,
  status=case when p_hold then 'revoked' when p_provider_status in('active','trialing') and p_period_end is not null and p_period_end<=now() then 'expired' else p_provider_status end,
  current_period_end=case when p_hold then v_row.current_period_end else p_period_end end,
  provider_updated_at=case when p_hold then v_row.provider_updated_at else p_provider_updated_at end,
  updated_at=now()
 where id=p_id;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details)
 values(p_actor,case when p_hold then 'creator.access_held' else 'creator.access_restored' end,'creator_entitlement',p_id::text,jsonb_build_object('reason',trim(p_reason),'previous_status',v_row.status,'billing_changed',false));
 return jsonb_build_object('held',p_hold);
end $$;
revoke all on function public.creator_admin_access_hold(uuid,uuid,boolean,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.creator_admin_access_hold(uuid,uuid,boolean,text,text,timestamptz,timestamptz) to service_role;

create or replace function public.respond_to_creator_group_invite(p_actor uuid,p_invite uuid,p_accept boolean)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_invite public.group_invites%rowtype; v_group public.groups%rowtype;
begin
 if current_user<>'service_role' or p_actor is null then raise exception using errcode='42501',message='service only'; end if;
 if p_accept is null then raise exception using errcode='22023',message='invite response required'; end if;
 select * into v_invite from public.group_invites where id=p_invite and invited_user_id=p_actor for update;
 if not found then raise exception using errcode='P0002',message='invite not found'; end if;
 if v_invite.status<>'pending' and not(p_accept and v_invite.status='accepted') then raise exception using errcode='40001',message='invite no longer pending'; end if;
 select * into v_group from public.groups where id=v_invite.group_id;
 if not found then raise exception using errcode='P0002',message='community not found'; end if;
 if p_accept and v_group.access_type='paid' and v_group.owner_id<>p_actor and not exists(
  select 1 from public.creator_entitlements where user_id=p_actor and product_id=v_group.creator_product_id
   and status in('active','trialing') and (current_period_end is null or current_period_end>now())
 ) then raise exception using errcode='42501',message='current membership required'; end if;
 update public.group_invites set status=case when p_accept then 'accepted' else 'declined' end where id=p_invite;
 if p_accept then
  insert into public.group_members(group_id,user_id,role) values(v_group.id,p_actor,'member') on conflict(group_id,user_id) do nothing;
  if v_group.channel_id is not null then
   insert into public.channel_members(channel_id,user_id) values(v_group.channel_id,p_actor) on conflict(channel_id,user_id) do nothing;
  end if;
 end if;
 return jsonb_build_object('accepted',p_accept,'slug',v_group.slug);
end $$;
revoke all on function public.respond_to_creator_group_invite(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.respond_to_creator_group_invite(uuid,uuid,boolean) to service_role;
