create or replace function public.set_account_block(
  p_target_id uuid,
  p_blocked boolean
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_target_id is null or p_target_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid account';
  end if;
  if not exists (select 1 from public.users where id = p_target_id) then
    raise exception using errcode = '22023', message = 'invalid account';
  end if;

  if p_blocked then
    if not private.check_rate_limit('block:' || v_user_id::text, 20, 60) then
      raise exception using errcode = 'P0001', message = 'rate limit exceeded';
    end if;
    insert into public.blocks (blocker_id, blocked_id)
    values (v_user_id, p_target_id)
    on conflict (blocker_id, blocked_id) do nothing;

    delete from public.follows
    where (follower_id = v_user_id and following_id = p_target_id)
       or (follower_id = p_target_id and following_id = v_user_id);
  else
    delete from public.blocks
    where blocker_id = v_user_id and blocked_id = p_target_id;
  end if;

  return p_blocked;
end;
$$;

revoke all on function public.set_account_block(uuid, boolean) from public, anon;
grant execute on function public.set_account_block(uuid, boolean) to authenticated;
