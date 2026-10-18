-- Batch 1 authorized by the user on October 17, 2026. No other repair batch included.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
do $guard$ begin
 if to_regclass('public.game_room_messages') is not null then raise exception 'Repair precondition failed: game_room_messages already exists; reconcile schema first'; end if;
 if to_regclass('public.saved_searches') is not null then raise exception 'Repair precondition failed: saved_searches already exists; reconcile schema first'; end if;
 if to_regclass('public.member_context_handoff') is not null then raise exception 'Repair precondition failed: member_context_handoff already exists; reconcile schema first'; end if;
 if to_regclass('public.member_achievements') is not null then raise exception 'Repair precondition failed: member_achievements already exists; reconcile schema first'; end if;
 if md5(pg_get_functiondef('private.check_rate_limit(text,integer,integer)'::regprocedure)) <> '9700bcdb8041098dcc33bb98875d9188' then raise exception 'Live function changed: private.check_rate_limit(text,integer,integer); refresh review'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION private.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_prefix text := split_part(p_key, ':', 1);
  v_now timestamptz := now();
  v_count integer;
begin
  if v_uid is null or p_key <> v_prefix || ':' || v_uid::text then return false; end if;
  if not (
    (v_prefix = 'game-room' and p_max = 30 and p_window_seconds = 60) or
    (v_prefix = 'group-create' and p_max = 5 and p_window_seconds = 3600) or
    (v_prefix = 'group-message' and p_max = 60 and p_window_seconds = 60) or
    (v_prefix = 'group-reaction' and p_max = 120 and p_window_seconds = 60) or
    (v_prefix = 'group-member' and p_max = 40 and p_window_seconds = 3600) or
    (v_prefix = 'block' and p_max = 20 and p_window_seconds = 60) or
    (v_prefix = 'comment' and p_max = 30 and p_window_seconds = 60) or
    (v_prefix = 'follow' and p_max = 30 and p_window_seconds = 60) or
    (v_prefix = 'message' and p_max = 60 and p_window_seconds = 60) or
    (v_prefix = 'post' and p_max = 10 and p_window_seconds = 300) or
    (v_prefix = 'reaction' and p_max = 60 and p_window_seconds = 60)
  ) then return false; end if;

  insert into public.rate_limit_counters as counters (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    window_start = case
      when counters.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
      else counters.window_start
    end,
    count = case
      when counters.window_start < v_now - make_interval(secs => p_window_seconds) then 1
      else least(counters.count + 1, p_max + 1)
    end
  returning count into v_count;

  return v_count <= p_max;
end;
$function$
;
create table if not exists public.game_room_messages (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('mlb', 'nfl', 'nba', 'nhl', 'soccer')),
  game_id text not null check (char_length(game_id) between 1 and 80),
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists game_room_messages_room_time_idx
  on public.game_room_messages (sport, game_id, created_at desc);
create index if not exists game_room_messages_user_idx
  on public.game_room_messages (user_id, created_at desc);

alter table public.game_room_messages enable row level security;

create policy "Game rooms are readable"
  on public.game_room_messages for select
  using (true);

create policy "Members post to game rooms"
  on public.game_room_messages for insert
  with check (
    user_id = (select auth.uid())
    and private.check_rate_limit('game-room:' || user_id::text, 30, 60)
  );

create policy "Members edit own game room messages"
  on public.game_room_messages for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Members delete own game room messages"
  on public.game_room_messages for delete
  using (user_id = (select auth.uid()));

revoke all on public.game_room_messages from public, anon, authenticated;
grant select on public.game_room_messages to anon, authenticated;
grant insert, delete on public.game_room_messages to authenticated;
grant update(content, updated_at) on public.game_room_messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_room_messages'
  ) then
    alter publication supabase_realtime add table public.game_room_messages;
  end if;
end $$;

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  query text not null check (char_length(btrim(query)) between 1 and 64),
  query_key text not null check (char_length(query_key) between 1 and 64),
  result_tab text not null default 'all' check (result_tab in ('all', 'users', 'posts', 'picks', 'community', 'mlb', 'nfl')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, query_key, result_tab)
);

create index if not exists saved_searches_user_recent_idx
  on public.saved_searches (user_id, last_used_at desc);

alter table public.saved_searches enable row level security;

create policy "Members read own saved searches"
  on public.saved_searches for select
  using (user_id = (select auth.uid()));
create policy "Members save own searches"
  on public.saved_searches for insert
  with check (user_id = (select auth.uid()));
create policy "Members update own saved searches"
  on public.saved_searches for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Members delete own saved searches"
  on public.saved_searches for delete
  using (user_id = (select auth.uid()));

revoke all on public.saved_searches from public, anon, authenticated;
grant select, insert, update, delete on public.saved_searches to authenticated;

create table if not exists public.member_context_handoff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  path text not null,
  page_title text,
  scroll_y integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint member_context_handoff_internal_path check (
    path like '/%'
    and path not like '//%'
    and char_length(path) <= 900
    and path !~ '[[:cntrl:]]'
    and path !~ '^/(api|auth|admin)(/|$)'
  ),
  constraint member_context_handoff_scroll check (scroll_y between 0 and 10000000),
  constraint member_context_handoff_title_length check (char_length(coalesce(page_title, '')) <= 160)
);

alter table public.member_context_handoff enable row level security;

create policy "Members read their own context handoff"
  on public.member_context_handoff for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Members create their own context handoff"
  on public.member_context_handoff for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Members update their own context handoff"
  on public.member_context_handoff for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists member_context_handoff_updated_at_idx
  on public.member_context_handoff (updated_at desc);

revoke all on table public.member_context_handoff from public, anon, authenticated;
grant select, insert, update on table public.member_context_handoff to authenticated;

create table if not exists public.member_achievements (
  user_id uuid not null references public.users(id) on delete cascade,
  achievement_key text not null check (achievement_key ~ '^[a-z0-9_]{2,48}$'),
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

create index if not exists member_achievements_recent_idx
  on public.member_achievements (earned_at desc);

alter table public.member_achievements enable row level security;

create policy "Achievements are publicly readable"
  on public.member_achievements for select using (true);

revoke all on public.member_achievements from public, anon, authenticated;
grant select on public.member_achievements to anon, authenticated;

create or replace function public.get_member_mastery()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  member_id uuid := auth.uid();
  posts_total integer := 0;
  picks_total integer := 0;
  graded_wins integer := 0;
  replies_total integer := 0;
  following_total integer := 0;
  communities_total integer := 0;
  notes_total integer := 0;
  today_posts integer := 0;
  week_picks integer := 0;
  week_replies integer := 0;
  points integer := 0;
  earned text[] := '{}';
begin
  if member_id is null then raise exception 'Authentication required'; end if;

  select count(*)::integer,
         count(*) filter (where post_type in ('pick', 'parlay'))::integer,
         count(*) filter (where created_at >= date_trunc('day', now()))::integer,
         count(*) filter (where post_type in ('pick', 'parlay') and created_at >= date_trunc('week', now()))::integer,
         count(*) filter (where post_type in ('pick', 'parlay') and pick_data->>'result' = 'win')::integer
    into posts_total, picks_total, today_posts, week_picks, graded_wins
  from public.posts where author_id = member_id;

  select count(*)::integer,
         count(*) filter (where created_at >= date_trunc('week', now()))::integer
    into replies_total, week_replies
  from public.comments where author_id = member_id;

  select count(*)::integer into following_total from public.follows where follower_id = member_id;
  select count(*)::integer into communities_total from public.group_members where user_id = member_id;
  select count(*)::integer into notes_total from public.research_notes where user_id = member_id;

  points := posts_total * 8 + picks_total * 12 + graded_wins * 20 + replies_total * 4
    + least(following_total, 100) * 2 + communities_total * 10 + notes_total * 6;

  if posts_total >= 1 then earned := array_append(earned, 'first_signal'); end if;
  if picks_total >= 10 then earned := array_append(earned, 'ten_picks'); end if;
  if graded_wins >= 10 then earned := array_append(earned, 'ten_wins'); end if;
  if replies_total >= 25 then earned := array_append(earned, 'conversation_starter'); end if;
  if communities_total >= 3 then earned := array_append(earned, 'clubhouse_regular'); end if;
  if notes_total >= 10 then earned := array_append(earned, 'research_routine'); end if;

  insert into public.member_achievements (user_id, achievement_key)
  select member_id, key from unnest(earned) key
  on conflict do nothing;

  return jsonb_build_object(
    'points', points,
    'level', greatest(1, floor(sqrt(points::numeric / 100))::integer + 1),
    'totals', jsonb_build_object(
      'posts', posts_total, 'picks', picks_total, 'wins', graded_wins,
      'replies', replies_total, 'following', following_total,
      'communities', communities_total, 'notes', notes_total
    ),
    'missions', jsonb_build_array(
      jsonb_build_object('key','daily_signal','title','Share today','current',least(today_posts,1),'target',1,'period','daily','points',15),
      jsonb_build_object('key','weekly_picks','title','Track five picks','current',least(week_picks,5),'target',5,'period','weekly','points',40),
      jsonb_build_object('key','weekly_replies','title','Join five conversations','current',least(week_replies,5),'target',5,'period','weekly','points',25),
      jsonb_build_object('key','research_notes','title','Build a research routine','current',least(notes_total,10),'target',10,'period','career','points',60)
    ),
    'achievements', to_jsonb(earned)
  );
end;
$$;

revoke all on function public.get_member_mastery() from public, anon;
grant execute on function public.get_member_mastery() to authenticated;

grant all on table public.game_room_messages to service_role;
grant all on table public.saved_searches to service_role;
grant all on table public.member_context_handoff to service_role;
grant all on table public.member_achievements to service_role;
NOTIFY pgrst, 'reload schema';
