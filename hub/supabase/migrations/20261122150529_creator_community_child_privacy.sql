-- Child social content inherits the parent post's existing RLS, including paid-group access.
-- Additive restrictive policies only. Existing author ownership, blocks, rate limits, and grants stay in force.
set lock_timeout='3s';
set statement_timeout='30s';
do $$ declare item record; actual text; begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='Community posts require current group access') then
  raise exception 'Community post access baseline unavailable';
 end if;
 for item in select * from (values
  ('comments','a25dcac96ab141388168555518c0aa37'),
  ('poll_votes','a41db015b216dfd1074ded343c40d5b2'),
  ('polls','f8a40b608788694c72477770fec1e1c5'),
  ('reactions','8365ffad3181bfe7abfad0f6608f85ac')
 ) baseline(table_name,policies_hash) loop
  select md5(string_agg(concat_ws('|',policyname,permissive,cmd,roles::text,coalesce(qual,''),coalesce(with_check,'')),E'\n' order by policyname))
    into actual from pg_policies where schemaname='public' and tablename=item.table_name;
  if actual is distinct from item.policies_hash
     or not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=item.table_name and c.relrowsecurity)
  then raise exception 'Child content policy baseline changed: %',item.table_name; end if;
 end loop;
end $$;

create policy "Comments inherit post read access" on public.comments as restrictive for select to anon,authenticated
using (exists(select 1 from public.posts p where p.id=comments.post_id));
create policy "Comments inherit post insert access" on public.comments as restrictive for insert to authenticated
with check (exists(select 1 from public.posts p where p.id=comments.post_id));
create policy "Comments inherit post update access" on public.comments as restrictive for update to authenticated
using (exists(select 1 from public.posts p where p.id=comments.post_id))
with check (exists(select 1 from public.posts p where p.id=comments.post_id));

create policy "Polls inherit post read access" on public.polls as restrictive for select to anon,authenticated
using (exists(select 1 from public.posts p where p.id=polls.post_id));
create policy "Polls require owned visible post" on public.polls as restrictive for insert to authenticated
with check (exists(select 1 from public.posts p where p.id=polls.post_id and p.author_id=(select auth.uid())));

create policy "Votes inherit poll read access" on public.poll_votes as restrictive for select to anon,authenticated
using (exists(select 1 from public.polls p where p.id=poll_votes.poll_id));
create policy "Votes inherit poll insert access" on public.poll_votes as restrictive for insert to authenticated
with check (exists(select 1 from public.polls p where p.id=poll_votes.poll_id));
create policy "Votes inherit poll update access" on public.poll_votes as restrictive for update to authenticated
using (exists(select 1 from public.polls p where p.id=poll_votes.poll_id))
with check (exists(select 1 from public.polls p where p.id=poll_votes.poll_id));

create policy "Reactions inherit social target read access" on public.reactions as restrictive for select to anon,authenticated
using (case target_type
 when 'post' then exists(select 1 from public.posts p where p.id=reactions.target_id)
 when 'comment' then exists(select 1 from public.comments c where c.id=reactions.target_id)
 else true end);
create policy "Reactions inherit social target insert access" on public.reactions as restrictive for insert to authenticated
with check (case target_type
 when 'post' then exists(select 1 from public.posts p where p.id=reactions.target_id)
 when 'comment' then exists(select 1 from public.comments c where c.id=reactions.target_id)
 else true end);
