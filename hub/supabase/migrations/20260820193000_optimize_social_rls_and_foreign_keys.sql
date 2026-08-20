-- Preserve every existing authorization rule while preventing auth.uid()
-- from being re-evaluated for each candidate row.
do $migration$
declare
  policy_row record;
  statement text;
begin
  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename <> 'creator_tiers'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
      )
  loop
    statement := format(
      'alter policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
    if policy_row.qual is not null then
      statement := statement || format(
        ' using (%s)',
        replace(policy_row.qual, 'auth.uid()', '(select auth.uid())')
      );
    end if;
    if policy_row.with_check is not null then
      statement := statement || format(
        ' with check (%s)',
        replace(policy_row.with_check, 'auth.uid()', '(select auth.uid())')
      );
    end if;
    execute statement;
  end loop;
end
$migration$;

-- The old ALL policy overlapped the public SELECT policy. Split mutations
-- from reads and combine the two SELECT predicates without changing access.
drop policy if exists "Creator tiers are public" on public.creator_tiers;
drop policy if exists "Creators manage their tiers" on public.creator_tiers;

create policy "Creator tiers are public or owned"
  on public.creator_tiers for select
  using (is_active = true or (select auth.uid()) = creator_id);
create policy "Creators insert their tiers"
  on public.creator_tiers for insert
  with check ((select auth.uid()) = creator_id);
create policy "Creators update their tiers"
  on public.creator_tiers for update
  using ((select auth.uid()) = creator_id)
  with check ((select auth.uid()) = creator_id);
create policy "Creators delete their tiers"
  on public.creator_tiers for delete
  using ((select auth.uid()) = creator_id);

-- These two policies were identical, so retaining one is semantically exact.
drop policy if exists "public read near_hrs" on public.near_hrs;

-- Foreign-key indexes keep parent updates/deletes and common joins from
-- scanning entire child tables. They do not change result semantics.
create index if not exists idx_bookmarks_post_id on public.bookmarks (post_id);
create index if not exists idx_channel_members_user_id on public.channel_members (user_id);
create index if not exists idx_channels_owner_id on public.channels (owner_id);
create index if not exists idx_comments_author_id on public.comments (author_id);
create index if not exists idx_comments_parent_id on public.comments (parent_id);
create index if not exists idx_creator_tiers_creator_id on public.creator_tiers (creator_id);
create index if not exists idx_media_uploader_id on public.media (uploader_id);
create index if not exists idx_messages_dm_recipient_id on public.messages (dm_recipient_id);
create index if not exists idx_messages_reply_to_id on public.messages (reply_to_id);
create index if not exists idx_notifications_actor_id on public.notifications (actor_id);
create index if not exists idx_reposts_post_id on public.reposts (post_id);
create index if not exists idx_subscriptions_tier_id on public.subscriptions (tier_id);

-- unaccent is relocatable; keep extensions out of the exposed public schema.
create schema if not exists extensions;
alter extension unaccent set schema extensions;
