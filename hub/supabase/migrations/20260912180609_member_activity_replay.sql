create table if not exists public.member_activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null unique,
  activity_type text not null check (activity_type in ('post', 'pick', 'reply', 'reaction', 'follow', 'community', 'research')),
  object_id text,
  target_path text not null,
  label text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint member_activity_events_path check (
    target_path like '/%'
    and target_path not like '//%'
    and target_path !~ '^/(api|auth|admin)(/|$)'
    and char_length(target_path) <= 900
  ),
  constraint member_activity_events_label check (char_length(label) between 1 and 180)
);

create index if not exists member_activity_events_member_time_idx
  on public.member_activity_events (user_id, occurred_at desc, id desc);

alter table public.member_activity_events enable row level security;

create policy "Members read their own activity replay"
  on public.member_activity_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.member_activity_events from public, anon, authenticated;
grant select on table public.member_activity_events to authenticated;

create or replace function private.capture_member_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(new);
  member_id uuid;
  event_type text;
  event_object text;
  event_path text;
  event_label text;
  event_time timestamptz;
  related_slug text;
begin
  event_time := coalesce(nullif(row_data ->> 'created_at', '')::timestamptz, nullif(row_data ->> 'joined_at', '')::timestamptz, now());

  if tg_table_name = 'posts' then
    member_id := (row_data ->> 'author_id')::uuid;
    event_object := row_data ->> 'id';
    event_type := case when row_data ->> 'post_type' in ('pick', 'parlay') then 'pick' else 'post' end;
    event_path := '/posts/' || event_object;
    event_label := case when event_type = 'pick' then 'Published a tracked pick' else 'Published a post' end;
  elsif tg_table_name = 'comments' then
    member_id := (row_data ->> 'author_id')::uuid;
    event_object := row_data ->> 'id';
    event_type := 'reply';
    event_path := '/posts/' || (row_data ->> 'post_id');
    event_label := 'Replied to a post';
  elsif tg_table_name = 'forum_replies' then
    member_id := (row_data ->> 'author_id')::uuid;
    event_object := row_data ->> 'id';
    event_type := 'reply';
    event_path := '/forum/thread/' || (row_data ->> 'thread_id');
    event_label := 'Joined a discussion';
  elsif tg_table_name = 'reactions' then
    member_id := (row_data ->> 'user_id')::uuid;
    event_object := (row_data ->> 'target_id') || ':' || coalesce(row_data ->> 'emoji', 'reaction');
    event_type := 'reaction';
    if row_data ->> 'target_type' = 'post' then
      event_path := '/posts/' || (row_data ->> 'target_id');
      event_label := 'Reacted to a post';
    elsif row_data ->> 'target_type' = 'comment' then
      select '/posts/' || post_id::text into event_path from public.comments where id = (row_data ->> 'target_id')::uuid;
      event_label := 'Reacted to a reply';
    else
      return new;
    end if;
  elsif tg_table_name = 'follows' then
    member_id := (row_data ->> 'follower_id')::uuid;
    event_object := row_data ->> 'following_id';
    event_type := 'follow';
    select username into related_slug from public.users where id = event_object::uuid;
    event_path := case when related_slug is null then '/explore' else '/profile/' || related_slug end;
    event_label := 'Followed a member';
  elsif tg_table_name = 'group_members' then
    member_id := (row_data ->> 'user_id')::uuid;
    event_object := row_data ->> 'group_id';
    event_type := 'community';
    select slug into related_slug from public.groups where id = event_object::uuid;
    event_path := case when related_slug is null then '/groups' else '/groups/' || related_slug end;
    event_label := 'Joined a community';
  elsif tg_table_name = 'research_notes' then
    member_id := (row_data ->> 'user_id')::uuid;
    event_object := row_data ->> 'id';
    event_type := 'research';
    event_path := '/workspace';
    event_label := left(coalesce(nullif(row_data ->> 'title', ''), 'Saved a research note'), 180);
  else
    return new;
  end if;

  if member_id is not null and event_path is not null then
    insert into public.member_activity_events
      (user_id, source_key, activity_type, object_id, target_path, label, occurred_at)
    values
      (member_id, tg_table_name || ':' || member_id::text || ':' || coalesce(event_object, md5(row_data::text)), event_type, event_object, event_path, event_label, event_time)
    on conflict (source_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.capture_member_activity() from public;

drop trigger if exists capture_post_member_activity on public.posts;
create trigger capture_post_member_activity after insert on public.posts
for each row execute function private.capture_member_activity();

drop trigger if exists capture_comment_member_activity on public.comments;
create trigger capture_comment_member_activity after insert on public.comments
for each row execute function private.capture_member_activity();

drop trigger if exists capture_forum_reply_member_activity on public.forum_replies;
create trigger capture_forum_reply_member_activity after insert on public.forum_replies
for each row execute function private.capture_member_activity();

drop trigger if exists capture_reaction_member_activity on public.reactions;
create trigger capture_reaction_member_activity after insert on public.reactions
for each row execute function private.capture_member_activity();

drop trigger if exists capture_follow_member_activity on public.follows;
create trigger capture_follow_member_activity after insert on public.follows
for each row execute function private.capture_member_activity();

drop trigger if exists capture_group_member_activity on public.group_members;
create trigger capture_group_member_activity after insert on public.group_members
for each row execute function private.capture_member_activity();

drop trigger if exists capture_research_note_member_activity on public.research_notes;
create trigger capture_research_note_member_activity after insert on public.research_notes
for each row execute function private.capture_member_activity();

insert into public.member_activity_events (user_id, source_key, activity_type, object_id, target_path, label, occurred_at)
select author_id, 'posts:' || author_id::text || ':' || id::text,
  case when post_type in ('pick', 'parlay') then 'pick' else 'post' end,
  id::text, '/posts/' || id::text,
  case when post_type in ('pick', 'parlay') then 'Published a tracked pick' else 'Published a post' end,
  created_at
from public.posts
where author_id is not null and created_at >= now() - interval '365 days'
on conflict (source_key) do nothing;

insert into public.member_activity_events (user_id, source_key, activity_type, object_id, target_path, label, occurred_at)
select author_id, 'comments:' || author_id::text || ':' || id::text, 'reply', id::text, '/posts/' || post_id::text, 'Replied to a post', created_at
from public.comments
where author_id is not null and created_at >= now() - interval '365 days'
on conflict (source_key) do nothing;

insert into public.member_activity_events (user_id, source_key, activity_type, object_id, target_path, label, occurred_at)
select user_id, 'research_notes:' || user_id::text || ':' || id::text, 'research', id::text, '/workspace', left(coalesce(nullif(title, ''), 'Saved a research note'), 180), created_at
from public.research_notes
where created_at >= now() - interval '365 days'
on conflict (source_key) do nothing;

insert into public.member_activity_events (user_id, source_key, activity_type, object_id, target_path, label, occurred_at)
select reply.author_id, 'forum_replies:' || reply.author_id::text || ':' || reply.id::text, 'reply', reply.id::text,
  '/forum/thread/' || reply.thread_id::text, 'Joined a discussion', reply.created_at
from public.forum_replies reply
where reply.author_id is not null and reply.created_at >= now() - interval '365 days'
on conflict (source_key) do nothing;

insert into public.member_activity_events (user_id, source_key, activity_type, object_id, target_path, label, occurred_at)
select reaction.user_id,
  'reactions:' || reaction.user_id::text || ':' || reaction.target_id::text || ':' || reaction.emoji,
  'reaction', reaction.target_id::text || ':' || reaction.emoji,
  case when reaction.target_type = 'post' then '/posts/' || reaction.target_id::text else '/posts/' || comment.post_id::text end,
  case when reaction.target_type = 'post' then 'Reacted to a post' else 'Reacted to a reply' end,
  reaction.created_at
from public.reactions reaction
left join public.comments comment on reaction.target_type = 'comment' and comment.id = reaction.target_id
where reaction.target_type in ('post', 'comment')
  and (reaction.target_type = 'post' or comment.id is not null)
  and reaction.created_at >= now() - interval '365 days'
on conflict (source_key) do nothing;

insert into public.member_activity_events (user_id, source_key, activity_type, object_id, target_path, label, occurred_at)
select follow.follower_id, 'follows:' || follow.follower_id::text || ':' || follow.following_id::text, 'follow', follow.following_id::text,
  '/profile/' || followed.username, 'Followed a member', follow.created_at
from public.follows follow
join public.users followed on followed.id = follow.following_id
where follow.created_at >= now() - interval '365 days'
on conflict (source_key) do nothing;

insert into public.member_activity_events (user_id, source_key, activity_type, object_id, target_path, label, occurred_at)
select membership.user_id, 'group_members:' || membership.user_id::text || ':' || membership.group_id::text, 'community', membership.group_id::text,
  '/groups/' || community.slug, 'Joined a community', membership.joined_at
from public.group_members membership
join public.groups community on community.id = membership.group_id
where membership.joined_at >= now() - interval '365 days'
on conflict (source_key) do nothing;
