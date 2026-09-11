create index if not exists blog_likes_user_id_idx on public.blog_likes(user_id);

drop policy if exists "blog likes are publicly readable" on public.blog_likes;
drop policy if exists "members manage their blog likes" on public.blog_likes;
create policy "members read their blog likes"
  on public.blog_likes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop function if exists public.toggle_blog_like(uuid);

create function public.toggle_blog_like(p_blog_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_liked boolean;
  v_count integer;
begin
  if not exists (select 1 from public.blogs where id = p_blog_id and status = 'published') then
    raise exception 'article not found';
  end if;

  if exists (select 1 from public.blog_likes where blog_id = p_blog_id and user_id = p_user_id) then
    delete from public.blog_likes where blog_id = p_blog_id and user_id = p_user_id;
    v_liked := false;
  else
    insert into public.blog_likes (blog_id, user_id) values (p_blog_id, p_user_id) on conflict do nothing;
    v_liked := true;
  end if;

  select count(*)::integer into v_count from public.blog_likes where blog_id = p_blog_id;
  update public.blogs set like_count = v_count where id = p_blog_id;
  return jsonb_build_object('liked', v_liked, 'count', v_count);
end;
$$;

revoke all on function public.toggle_blog_like(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_blog_like(uuid, uuid) to service_role;
