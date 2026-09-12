alter table public.groups
  add column if not exists rules text
    check (rules is null or char_length(rules) <= 4000);

create table if not exists public.group_member_preferences (
  group_id uuid not null,
  user_id uuid not null,
  rules_accepted_at timestamptz,
  flair text check (flair is null or char_length(flair) <= 32),
  notification_level text not null default 'highlights'
    check (notification_level in ('all', 'highlights', 'mentions', 'muted')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  foreign key (group_id, user_id)
    references public.group_members(group_id, user_id)
    on delete cascade
);

create table if not exists public.group_channel_preferences (
  group_id uuid not null,
  user_id uuid not null,
  channel_id uuid not null references public.channels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id, channel_id),
  foreign key (group_id, user_id)
    references public.group_members(group_id, user_id)
    on delete cascade
);

create index if not exists idx_group_channel_preferences_channel
  on public.group_channel_preferences(channel_id);

alter table public.group_member_preferences enable row level security;
alter table public.group_channel_preferences enable row level security;

create policy "Members read own group preferences"
on public.group_member_preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy "Members create own group preferences"
on public.group_member_preferences for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.group_members membership
    where membership.group_id = group_member_preferences.group_id
      and membership.user_id = (select auth.uid())
  )
);

create policy "Members update own group preferences"
on public.group_member_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.group_members membership
    where membership.group_id = group_member_preferences.group_id
      and membership.user_id = (select auth.uid())
  )
);

create policy "Members delete own group preferences"
on public.group_member_preferences for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Members read own channel preferences"
on public.group_channel_preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy "Members create own channel preferences"
on public.group_channel_preferences for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.group_members membership
    where membership.group_id = group_channel_preferences.group_id
      and membership.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.channels channel
    where channel.id = group_channel_preferences.channel_id
      and channel.group_id = group_channel_preferences.group_id
  )
);

create policy "Members delete own channel preferences"
on public.group_channel_preferences for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.group_member_preferences to authenticated;
grant select, insert, delete on public.group_channel_preferences to authenticated;
revoke all on public.group_member_preferences, public.group_channel_preferences from anon;

create or replace function public.save_group_member_onboarding(
  p_group_id uuid,
  p_rules_accepted boolean,
  p_notification_level text,
  p_flair text default null,
  p_channel_ids uuid[] default '{}'::uuid[]
)
returns public.group_member_preferences
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.group_member_preferences;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1 from public.group_members membership
    where membership.group_id = p_group_id and membership.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Group membership required';
  end if;

  if not p_rules_accepted then
    raise exception using errcode = '22023', message = 'Community rules must be accepted';
  end if;

  if p_notification_level not in ('all', 'highlights', 'mentions', 'muted') then
    raise exception using errcode = '22023', message = 'Invalid notification level';
  end if;

  if p_flair is not null and char_length(btrim(p_flair)) > 32 then
    raise exception using errcode = '22023', message = 'Flair is too long';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_channel_ids, '{}'::uuid[])) as selected_channel(value)
    where not exists (
      select 1 from public.channels channel
      where channel.id = selected_channel.value and channel.group_id = p_group_id
    )
  ) then
    raise exception using errcode = '22023', message = 'Invalid channel selection';
  end if;

  insert into public.group_member_preferences (
    group_id,
    user_id,
    rules_accepted_at,
    notification_level,
    flair,
    onboarding_completed_at,
    updated_at
  ) values (
    p_group_id,
    v_user_id,
    now(),
    p_notification_level,
    nullif(btrim(p_flair), ''),
    now(),
    now()
  )
  on conflict (group_id, user_id) do update set
    rules_accepted_at = coalesce(group_member_preferences.rules_accepted_at, excluded.rules_accepted_at),
    notification_level = excluded.notification_level,
    flair = excluded.flair,
    onboarding_completed_at = coalesce(group_member_preferences.onboarding_completed_at, excluded.onboarding_completed_at),
    updated_at = now()
  returning * into v_result;

  delete from public.group_channel_preferences preference
  where preference.group_id = p_group_id and preference.user_id = v_user_id;

  insert into public.group_channel_preferences (group_id, user_id, channel_id)
  select p_group_id, v_user_id, selected.value
  from (
    select distinct value
    from unnest(coalesce(p_channel_ids, '{}'::uuid[])) as selected_channel(value)
  ) selected;

  return v_result;
end;
$$;

revoke all on function public.save_group_member_onboarding(uuid, boolean, text, text, uuid[]) from public, anon;
grant execute on function public.save_group_member_onboarding(uuid, boolean, text, text, uuid[]) to authenticated;

create or replace function public.set_community_group_rules(
  p_group_id uuid,
  p_rules text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rules text := nullif(btrim(p_rules), '');
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1 from public.groups community
    where community.id = p_group_id and community.owner_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'Group owner access required';
  end if;

  if v_rules is not null and char_length(v_rules) > 4000 then
    raise exception using errcode = '22023', message = 'Community rules are too long';
  end if;

  update public.groups
  set rules = v_rules
  where id = p_group_id;

  return v_rules;
end;
$$;

revoke all on function public.set_community_group_rules(uuid, text) from public, anon;
grant execute on function public.set_community_group_rules(uuid, text) to authenticated;
