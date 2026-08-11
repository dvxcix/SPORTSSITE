-- Public article reads must not require UPDATE access to the underlying row.
-- Keep the counter atomic under concurrent traffic and expose it only through
-- the server-side service role used by the rendered blog page.
create or replace function public.record_blog_view(p_blog_id uuid)
returns integer
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.blogs
  set view_count = coalesce(view_count, 0) + 1
  where id = p_blog_id
    and status = 'published'
  returning view_count;
$$;

revoke all on function public.record_blog_view(uuid) from public, anon, authenticated;
grant execute on function public.record_blog_view(uuid) to service_role;
