-- Restrict public RPC execution, bind rate limiting to the authenticated user,
-- pin function search paths, optimize hot RLS checks, and index foreign keys.

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_prefix text := split_part(p_key, ':', 1);
  v_window_start timestamptz;
  v_count integer;
begin
  if v_uid is null or p_key <> v_prefix || ':' || v_uid::text then
    return false;
  end if;

  if not (
    (v_prefix = 'block' and p_max = 20 and p_window_seconds = 60) or
    (v_prefix = 'comment' and p_max = 30 and p_window_seconds = 60) or
    (v_prefix = 'follow' and p_max = 30 and p_window_seconds = 60) or
    (v_prefix = 'message' and p_max = 60 and p_window_seconds = 60) or
    (v_prefix = 'post' and p_max = 10 and p_window_seconds = 300) or
    (v_prefix = 'reaction' and p_max = 60 and p_window_seconds = 60)
  ) then
    return false;
  end if;

  select window_start, count into v_window_start, v_count
  from public.rate_limit_counters where key = p_key for update;

  if not found or v_window_start < now() - make_interval(secs => p_window_seconds) then
    insert into public.rate_limit_counters (key, window_start, count)
    values (p_key, now(), 1)
    on conflict (key) do update set window_start = now(), count = 1;
    return true;
  end if;

  if v_count >= p_max then return false; end if;
  update public.rate_limit_counters set count = count + 1 where key = p_key;
  return true;
end;
$$;

create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id = (select auth.uid()) and exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

alter function public.apply_leg_result_to_post(uuid, integer, text, text, jsonb) set search_path = pg_catalog, public;
alter function public.cast_poll_vote(uuid, integer) set search_path = pg_catalog, public;
alter function public.enforce_matrix_cap() set search_path = pg_catalog, public;
alter function public.enforce_registration_toggle() set search_path = pg_catalog, public;
alter function public.handle_new_user() set search_path = pg_catalog, public;
alter function public.notify_admins_on_report() set search_path = pg_catalog, public;
alter function public.notify_email_on_insert() set search_path = pg_catalog, public;
alter function public.notify_push_on_insert() set search_path = pg_catalog, public;
alter function public.notify_reaction(uuid, uuid, uuid, text) set search_path = pg_catalog, public;
alter function public.recompute_user_pick_record(uuid) set search_path = pg_catalog, public;
alter function public.sync_comment_reaction_count() set search_path = pg_catalog, public;
alter function public.sync_group_member_count() set search_path = pg_catalog, public;
alter function public.sync_post_bookmark_count() set search_path = pg_catalog, public;
alter function public.sync_post_comment_count() set search_path = pg_catalog, public;
alter function public.sync_post_reaction_count() set search_path = pg_catalog, public;
alter function public.sync_post_reaction_summary() set search_path = pg_catalog, public;
alter function public.sync_post_repost_count() set search_path = pg_catalog, public;
alter function public.sync_user_follow_counts() set search_path = pg_catalog, public;
alter function public.trigger_recompute_pick_record() set search_path = pg_catalog, public;

revoke execute on function public.apply_leg_result_to_post(uuid, integer, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.cast_poll_vote(uuid, integer) from public, anon;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon;
revoke execute on function public.is_group_member(uuid, uuid) from public, anon;
revoke execute on function public.notify_reaction(uuid, uuid, uuid, text) from public, anon;

grant execute on function public.apply_leg_result_to_post(uuid, integer, text, text, jsonb) to service_role;
grant execute on function public.cast_poll_vote(uuid, integer) to authenticated, service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated, service_role;
grant execute on function public.is_group_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.notify_reaction(uuid, uuid, uuid, text) to authenticated, service_role;

revoke execute on function public.enforce_matrix_cap() from public, anon, authenticated;
revoke execute on function public.enforce_registration_toggle() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.notify_admins_on_report() from public, anon, authenticated;
revoke execute on function public.notify_email_on_insert() from public, anon, authenticated;
revoke execute on function public.notify_push_on_insert() from public, anon, authenticated;
revoke execute on function public.recompute_user_pick_record(uuid) from public, anon, authenticated;
revoke execute on function public.record_matrix_marketplace_copy() from public, anon, authenticated;
revoke execute on function public.sync_comment_reaction_count() from public, anon, authenticated;
revoke execute on function public.sync_group_member_count() from public, anon, authenticated;
revoke execute on function public.sync_post_bookmark_count() from public, anon, authenticated;
revoke execute on function public.sync_post_comment_count() from public, anon, authenticated;
revoke execute on function public.sync_post_reaction_count() from public, anon, authenticated;
revoke execute on function public.sync_post_reaction_summary() from public, anon, authenticated;
revoke execute on function public.sync_post_repost_count() from public, anon, authenticated;
revoke execute on function public.sync_user_follow_counts() from public, anon, authenticated;
revoke execute on function public.trigger_recompute_pick_record() from public, anon, authenticated;

drop policy if exists "Users see own dismissals" on public.changelog_dismissals;
create policy "Users see own dismissals" on public.changelog_dismissals
for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users create own dismissals" on public.changelog_dismissals;
create policy "Users create own dismissals" on public.changelog_dismissals
for insert to authenticated with check ((select auth.uid()) = user_id);

create index if not exists idx_changelog_dismissals_entry_id on public.changelog_dismissals(entry_id);
create index if not exists idx_changelog_entries_created_by on public.changelog_entries(created_by);
create index if not exists idx_channels_creator_product_id on public.channels(creator_product_id);
create index if not exists idx_channels_group_id on public.channels(group_id);
create index if not exists idx_creator_commerce_events_product_id on public.creator_commerce_events(product_id);
create index if not exists idx_daily_featured_game_set_by on public.daily_featured_game(set_by);
create index if not exists idx_groups_creator_product_id on public.groups(creator_product_id);
create index if not exists idx_matrix_marketplace_source_matrix_id on public.matrix_marketplace_listings(source_matrix_id);
create index if not exists idx_picks_creator_product_id on public.picks(creator_product_id);
create index if not exists idx_post_poll_votes_user_id on public.post_poll_votes(user_id);
create index if not exists idx_posts_creator_product_id on public.posts(creator_product_id);
create index if not exists idx_users_admin_granted_tier_by on public.users(admin_granted_tier_by);
