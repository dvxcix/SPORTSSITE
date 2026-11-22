-- A provider recheck with unchanged access must not endlessly requeue its own delivery.
create or replace function public.enqueue_creator_discord_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_user uuid; v_group uuid;
begin
 if tg_table_name='creator_entitlements' then
  if tg_op='UPDATE' and new.status is not distinct from old.status and new.current_period_end is not distinct from old.current_period_end and new.admin_revoked_at is not distinct from old.admin_revoked_at then return null;end if;
  for v_group in select id from public.groups where creator_product_id=new.product_id loop perform public.queue_creator_discord(v_group,new.user_id);end loop;
 elsif tg_table_name='users' then
  if new.discord_id is distinct from old.discord_id then
   for v_group in select group_id from public.group_members where user_id=new.id union select i.group_id from public.creator_discord_jobs j join public.creator_discord_integrations i on i.id=j.integration_id where j.user_id=new.id loop perform public.queue_creator_discord(v_group,new.id);end loop;
  end if;
 else
  if tg_op='DELETE' then v_user:=old.user_id;v_group:=old.group_id;else v_user:=new.user_id;v_group:=new.group_id;end if;
  perform public.queue_creator_discord(v_group,v_user);
 end if;
 return null;
end $$;
revoke all on function public.enqueue_creator_discord_change() from public,anon,authenticated;
