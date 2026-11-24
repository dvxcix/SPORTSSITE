-- Extend the existing immutable per-role delivery mappings. Never rewrite past mappings/jobs.
do $$begin
 if to_regclass('public.creator_discord_integrations') is null then raise exception 'Creator Discord baseline missing'; end if;
end $$;
drop index public.creator_discord_group_active;
create index creator_discord_group_active on public.creator_discord_integrations(group_id) where enabled;

create function public.configure_creator_discord_roles(p_creator uuid,p_group uuid,p_guild text,p_guild_name text,p_roles text[],p_role_names text[],p_invite text)
returns uuid[] language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_ids uuid[]:='{}';v_id uuid;v_user uuid;v_index integer;
begin
 if current_user<>'service_role' or not exists(select 1 from public.groups where id=p_group and owner_id=p_creator) then raise exception using errcode='42501',message='owner only';end if;
 if p_guild is not null and (p_guild!~'^\d{17,22}$' or coalesce(cardinality(p_roles),0) not between 1 and 5 or coalesce(cardinality(p_role_names),0)<>cardinality(p_roles) or (select count(distinct x) from unnest(p_roles) x)<>cardinality(p_roles) or exists(select 1 from unnest(p_roles) x where x is null or x!~'^\d{17,22}$') or exists(select 1 from unnest(p_role_names) x where x is null or length(x) not between 1 and 100)) then raise exception 'Choose one to five valid member roles';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_group::text,1));
 update public.creator_discord_integrations set enabled=false where group_id=p_group and enabled;
 if p_guild is not null then
  for v_index in 1..cardinality(p_roles) loop
   if exists(select 1 from public.creator_discord_integrations where guild_id=p_guild and role_id=p_roles[v_index] and group_id is distinct from p_group) then raise exception 'Use a separate membership role for this community';end if;
   insert into public.creator_discord_integrations(group_id,creator_id,guild_id,guild_name,role_id,role_name,invite_url)
   values(p_group,p_creator,p_guild,p_guild_name,p_roles[v_index],p_role_names[v_index],p_invite)
   on conflict(guild_id,role_id) do update set enabled=true,guild_name=excluded.guild_name,role_name=excluded.role_name,invite_url=excluded.invite_url returning id into v_id;
   v_ids:=array_append(v_ids,v_id);
  end loop;
 end if;
 for v_user in select user_id from public.group_members where group_id=p_group union select j.user_id from public.creator_discord_jobs j join public.creator_discord_integrations i on i.id=j.integration_id where i.group_id=p_group loop perform public.queue_creator_discord(p_group,v_user);end loop;
 return v_ids;
end $$;
revoke all on function public.configure_creator_discord_roles(uuid,uuid,text,text,text[],text[],text) from public,anon,authenticated;
grant execute on function public.configure_creator_discord_roles(uuid,uuid,text,text,text[],text[],text) to service_role;

-- Keep the old service signature working during the rolling deployment.
create or replace function public.configure_creator_discord(p_creator uuid,p_group uuid,p_guild text,p_guild_name text,p_role text,p_role_name text,p_invite text)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_ids uuid[];
begin
 v_ids:=public.configure_creator_discord_roles(p_creator,p_group,p_guild,p_guild_name,array[p_role],array[p_role_name],p_invite);
 return v_ids[1];
end $$;

create function public.enqueue_creator_discord_group_access_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_user uuid;
begin
 if new.access_type is not distinct from old.access_type and new.creator_product_id is not distinct from old.creator_product_id and new.owner_id is not distinct from old.owner_id then return null;end if;
 for v_user in select user_id from public.group_members where group_id=new.id union select j.user_id from public.creator_discord_jobs j join public.creator_discord_integrations i on i.id=j.integration_id where i.group_id=new.id loop perform public.queue_creator_discord(new.id,v_user);end loop;
 return null;
end $$;
revoke all on function public.enqueue_creator_discord_group_access_change() from public,anon,authenticated;
create trigger creator_discord_group_access_change after update of access_type,creator_product_id,owner_id on public.groups for each row execute function public.enqueue_creator_discord_group_access_change();
