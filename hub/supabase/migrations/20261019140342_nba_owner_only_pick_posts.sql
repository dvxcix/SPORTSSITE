-- Owner-only tracked picks for the admin-gated NBA review. No historical rows change.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- These are the exact live definitions reviewed with this narrowly scoped change.
-- Abort on drift rather than replacing unrelated access or record behavior.
do $$
begin
  if md5(pg_get_functiondef('public.recompute_user_pick_record(uuid)'::regprocedure))
      <> 'e2ce06589dd0d04e2d178a3089f77cf5' then
    raise exception 'Pick-record function changed; review before applying';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='posts'
      and policyname='Posts respect visibility and creator access' and cmd='SELECT'
      and permissive='PERMISSIVE' and md5(qual)='3a2436546c8e66dba515d173e291617a')
    or not exists (select 1 from pg_policies where schemaname='public' and tablename='picks'
      and policyname='Picks respect creator access' and cmd='SELECT'
      and permissive='PERMISSIVE' and md5(qual)='80e9ed5d8dfde2cf5ddfa74821598062') then
    raise exception 'Post/pick read policies changed; review before applying';
  end if;
  if exists (select 1 from pg_class where oid in ('public.posts'::regclass,'public.picks'::regclass,
      'public.comments'::regclass,'public.reposts'::regclass,'public.notifications'::regclass)
      and not relrowsecurity) then
    raise exception 'Owner-only posting requires existing RLS on all related tables';
  end if;
  if exists (select 1 from public.posts where visibility='private') then
    raise exception 'Existing private posts require a separate record/backfill review';
  end if;
end $$;

-- The parent is intentionally read as definer: an RLS-hidden private parent must
-- not look like an absent/public parent to a child's policy. Only a boolean is
-- returned, auth.uid() is checked inside, and the private schema is not an API.
create function private.can_access_owner_only_post(target_post uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.posts p where p.id=target_post
    and p.visibility='private' and p.author_id is distinct from (select auth.uid()));
$$;
revoke all on function private.can_access_owner_only_post(uuid) from public;
grant execute on function private.can_access_owner_only_post(uuid) to anon,authenticated,service_role;

create policy "Private posts are owner-only" on public.posts as restrictive for select
using (visibility is distinct from 'private' or author_id=(select auth.uid()));
create policy "Private post picks are owner-only" on public.picks as restrictive for all
using (private.can_access_owner_only_post(post_id))
with check (private.can_access_owner_only_post(post_id));
create policy "Private post comments are owner-only" on public.comments as restrictive for all
using (private.can_access_owner_only_post(post_id))
with check (private.can_access_owner_only_post(post_id));

-- Reposting cannot publish an owner-only post, even when attempted by its owner.
create function private.is_owner_only_post(target_post uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.posts p where p.id=target_post and p.visibility='private');
$$;
revoke all on function private.is_owner_only_post(uuid) from public;
grant execute on function private.is_owner_only_post(uuid) to anon,authenticated,service_role;
create policy "Private posts cannot be reposted" on public.reposts as restrictive for all
using (not private.is_owner_only_post(post_id))
with check (not private.is_owner_only_post(post_id));

-- Preserve every existing single/parlay win-loss-push rule. Private review picks
-- settle normally, but never contribute to the profile's public pick record.
create or replace function public.recompute_user_pick_record(p_user_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare
  v_wins int;
  v_losses int;
  v_pushes int;
begin
  with bets as (
    select
      post_id as bet_key,
      bool_and(result <> 'pending') as all_graded,
      bool_or(result = 'loss') as any_loss,
      bool_and(result = 'push') as all_push
    from picks
    where user_id = p_user_id and post_id is not null
      and not exists (select 1 from public.posts p where p.id=picks.post_id and p.visibility='private')
    group by post_id
  )
  select
    count(*) filter (where all_graded and not any_loss and not all_push),
    count(*) filter (where all_graded and any_loss),
    count(*) filter (where all_graded and all_push)
  into v_wins, v_losses, v_pushes
  from bets;

  update users set pick_record = jsonb_build_object(
    'wins', coalesce(v_wins, 0), 'losses', coalesce(v_losses, 0), 'pushes', coalesce(v_pushes, 0)
  ) where id = p_user_id;
end;
$$;

-- Neither a losing public pick nor a winning private pick can move across this
-- boundary. Linked picks also protect against changing post_type in two steps.
create function private.keep_tracked_pick_visibility()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.visibility is not distinct from 'private') <> (new.visibility is not distinct from 'private')
    and (old.visibility='private' or old.post_type in ('pick','parlay') or new.post_type in ('pick','parlay')
      or exists (select 1 from public.picks p where p.post_id=old.id)) then
    raise exception 'Tracked picks cannot change between only-me and shared visibility';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_tracked_pick_visibility() from public,anon,authenticated;
create trigger keep_tracked_pick_visibility before update of visibility on public.posts
for each row execute function private.keep_tracked_pick_visibility();

-- A linked private leg cannot be detached/relinked into a public record. Parent
-- deletion still cascades normally, so owners can delete their private test.
create function private.keep_tracked_pick_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.post_id is distinct from new.post_id and
    (private.is_owner_only_post(old.post_id) or private.is_owner_only_post(new.post_id)) then
    raise exception 'Only-me pick legs cannot change their tracked post';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_tracked_pick_parent() from public,anon,authenticated;
create trigger keep_tracked_pick_parent before update of post_id on public.picks
for each row execute function private.keep_tracked_pick_parent();

-- BEFORE insertion blocks notification push/email triggers as well as inbox
-- rows. The service-role grader may still notify the private pick's owner.
create function private.keep_owner_only_notifications()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  if new.target_type='post' then
    select p.author_id into v_author from public.posts p where p.id=new.target_id and p.visibility='private';
  elsif new.target_type='comment' then
    select p.author_id into v_author from public.comments c join public.posts p on p.id=c.post_id
      where c.id=new.target_id and p.visibility='private';
  end if;
  if v_author is not null and new.user_id is distinct from v_author then
    raise exception 'Only-me post notifications are restricted to the owner';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_owner_only_notifications() from public,anon,authenticated;
create trigger keep_owner_only_notifications before insert or update on public.notifications
for each row execute function private.keep_owner_only_notifications();

comment on function private.can_access_owner_only_post(uuid) is 'RLS boolean guard: private parent remains visible only to auth.uid() author; existing non-private access is unchanged.';
commit;
