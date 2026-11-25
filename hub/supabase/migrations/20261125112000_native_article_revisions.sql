-- Native drafts compare the last visible revision. The timestamp changes only
-- for editable article fields, so normal web likes and view counts do not
-- conflict with an open native draft.
create function private.touch_blog_editor_revision() returns trigger
language plpgsql security invoker set search_path = ''
as $function$
begin
  if (new.title,new.excerpt,new.content,new.cover_image,new.category,new.sport,new.status)
     is distinct from (old.title,old.excerpt,old.content,old.cover_image,old.category,old.sport,old.status) then
    new.updated_at := greatest(pg_catalog.clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end;
$function$;
revoke all on function private.touch_blog_editor_revision() from public,anon,authenticated;
create trigger blogs_touch_editor_revision before update on public.blogs
for each row execute function private.touch_blog_editor_revision();

create function public.set_native_blog_like(p_blog_id uuid, p_user_id uuid, p_liked boolean) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  current_count integer;
begin
  if p_blog_id is null or p_user_id is null or p_liked is null then return null; end if;
  perform 1 from public.blogs where id=p_blog_id and status='published' for update;
  if not found then return null; end if;

  if p_liked then
    insert into public.blog_likes(blog_id,user_id) values(p_blog_id,p_user_id) on conflict do nothing;
  else
    delete from public.blog_likes where blog_id=p_blog_id and user_id=p_user_id;
  end if;
  select count(*)::integer into current_count from public.blog_likes where blog_id=p_blog_id;
  update public.blogs set like_count=current_count where id=p_blog_id;
  return jsonb_build_object('liked',p_liked,'count',current_count);
end;
$function$;
revoke all on function public.set_native_blog_like(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_native_blog_like(uuid,uuid,boolean) to service_role;
