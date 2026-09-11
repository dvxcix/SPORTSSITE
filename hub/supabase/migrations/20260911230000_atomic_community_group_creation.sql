create or replace function public.create_community_group(
  p_name text,
  p_slug text,
  p_description text default null,
  p_sport text default null,
  p_emoji text default '👥',
  p_is_public boolean default true,
  p_creator_product_id uuid default null
)
returns table(group_id uuid, group_slug text, channel_id uuid, channel_slug text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_channel_id uuid;
  v_channel_slug text := 'group-' || p_slug;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if not exists (
    select 1 from public.users u
    where u.id = v_user_id
      and (
        u.account_type in ('creator', 'admin')
        or exists (
          select 1 from public.creator_applications ca
          where ca.user_id = v_user_id and ca.status = 'approved'
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'creator access required';
  end if;

  if p_name is null or length(btrim(p_name)) < 2 or length(btrim(p_name)) > 60 then
    raise exception using errcode = '22023', message = 'invalid group name';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug) > 70 then
    raise exception using errcode = '22023', message = 'invalid group slug';
  end if;
  if p_description is not null and length(p_description) > 280 then
    raise exception using errcode = '22023', message = 'description too long';
  end if;
  if p_emoji is null or length(p_emoji) > 16 then
    raise exception using errcode = '22023', message = 'invalid group icon';
  end if;

  if p_creator_product_id is not null and not exists (
    select 1 from public.creator_products cp
    where cp.id = p_creator_product_id
      and cp.creator_id = v_user_id
      and cp.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'membership unavailable';
  end if;

  insert into public.groups (
    name, slug, description, sport, emoji, is_public, owner_id,
    access_type, creator_product_id
  ) values (
    btrim(p_name), p_slug, nullif(btrim(p_description), ''), nullif(btrim(p_sport), ''),
    p_emoji, p_is_public, v_user_id,
    case when p_creator_product_id is null then 'free' else 'paid' end,
    p_creator_product_id
  ) returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_user_id, 'owner');

  insert into public.channels (
    name, slug, description, icon, channel_type, owner_id, member_count,
    group_id, creator_product_id
  ) values (
    btrim(p_name), v_channel_slug, nullif(btrim(p_description), ''), p_emoji,
    case when p_is_public then 'public' else 'members_only' end,
    v_user_id, 1, v_group_id, p_creator_product_id
  ) returning id into v_channel_id;

  insert into public.channel_members (channel_id, user_id)
  values (v_channel_id, v_user_id);

  update public.groups set channel_id = v_channel_id where id = v_group_id;

  return query select v_group_id, p_slug, v_channel_id, v_channel_slug;
end;
$$;

revoke all on function public.create_community_group(text, text, text, text, text, boolean, uuid) from public, anon;
grant execute on function public.create_community_group(text, text, text, text, text, boolean, uuid) to authenticated;

