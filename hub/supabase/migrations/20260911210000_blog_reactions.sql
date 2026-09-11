create table if not exists public.blog_likes (
  blog_id uuid not null references public.blogs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blog_id, user_id)
);

alter table public.blog_likes enable row level security;

drop policy if exists "blog likes are publicly readable" on public.blog_likes;
create policy "blog likes are publicly readable"
  on public.blog_likes for select
  using (true);

drop policy if exists "members manage their blog likes" on public.blog_likes;
create policy "members manage their blog likes"
  on public.blog_likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.toggle_blog_like(p_blog_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_liked boolean;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if exists (select 1 from public.blog_likes where blog_id = p_blog_id and user_id = v_user_id) then
    delete from public.blog_likes where blog_id = p_blog_id and user_id = v_user_id;
    v_liked := false;
  else
    insert into public.blog_likes (blog_id, user_id) values (p_blog_id, v_user_id) on conflict do nothing;
    v_liked := true;
  end if;

  select count(*)::integer into v_count from public.blog_likes where blog_id = p_blog_id;
  update public.blogs set like_count = v_count where id = p_blog_id and status = 'published';
  return jsonb_build_object('liked', v_liked, 'count', v_count);
end;
$$;

revoke all on function public.toggle_blog_like(uuid) from public, anon;
grant execute on function public.toggle_blog_like(uuid) to authenticated;
