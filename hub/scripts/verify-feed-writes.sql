-- Run with a maintenance connection. Every test write and rate-limit increment
-- is rolled back. Uses member RLS, not an admin bypass, for feed operations.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.users where id in (select id from auth.users) and account_type='user' limit 1),true);
set local role authenticated;
do $$
declare p uuid; kind text; n integer;
begin
  foreach kind in array array['text','analysis','poll'] loop
    insert into public.posts(author_id,content,post_type,visibility,is_spoiler,poll_data)
    values(auth.uid(),'Rollback-only feed regression',kind,'public',true,
      case when kind='poll' then '{"options":[{"text":"A","votes":0},{"text":"B","votes":0}]}'::jsonb else null end)
    returning id into p;
    insert into public.reposts(user_id,post_id) values(auth.uid(),p);
    select repost_count into n from public.posts where id=p;
    if n<>1 then raise exception 'Repost counter regression'; end if;
    delete from public.reposts where user_id=auth.uid() and post_id=p;
    select repost_count into n from public.posts where id=p;
    if n<>0 then raise exception 'Unrepost counter regression'; end if;
    delete from public.posts where id=p;
  end loop;
end $$;
rollback;
