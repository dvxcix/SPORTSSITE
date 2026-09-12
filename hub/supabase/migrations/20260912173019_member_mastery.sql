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
