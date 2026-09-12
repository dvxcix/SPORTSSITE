create or replace function public.update_community_group(
  p_group_id uuid,
  p_name text,
  p_description text default null,
  p_sport text default null,
  p_avatar_url text default null,
  p_banner_url text default null,
  p_is_public boolean default true
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_channel_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_name is null or length(btrim(p_name)) < 2 or length(btrim(p_name)) > 60 then
    raise exception using errcode = '22023', message = 'invalid group name';
  end if;
  if p_description is not null and length(p_description) > 280 then
    raise exception using errcode = '22023', message = 'description too long';
  end if;
  if p_sport is not null and length(p_sport) > 32 then
    raise exception using errcode = '22023', message = 'invalid sport';
  end if;
  if p_avatar_url is not null and (length(p_avatar_url) > 500 or p_avatar_url !~ '^https?://') then
    raise exception using errcode = '22023', message = 'invalid avatar URL';
  end if;
  if p_banner_url is not null and (length(p_banner_url) > 500 or p_banner_url !~ '^https?://') then
    raise exception using errcode = '22023', message = 'invalid banner URL';
  end if;

  select g.channel_id into v_channel_id
  from public.groups g
  where g.id = p_group_id and g.owner_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'group owner access required';
  end if;

  update public.groups
  set name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      sport = nullif(btrim(p_sport), ''),
      avatar_url = nullif(btrim(p_avatar_url), ''),
      banner_url = nullif(btrim(p_banner_url), ''),
      is_public = p_is_public
  where id = p_group_id and owner_id = v_user_id;

  if v_channel_id is not null then
    update public.channels
    set name = btrim(p_name),
        description = nullif(btrim(p_description), ''),
        channel_type = case when p_is_public then 'public' else 'members_only' end
    where id = v_channel_id and owner_id = v_user_id;
  end if;
end;
$$;

revoke all on function public.update_community_group(uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.update_community_group(uuid, text, text, text, text, text, boolean) to authenticated;
