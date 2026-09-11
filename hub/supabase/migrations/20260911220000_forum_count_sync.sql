create or replace function public.sync_forum_thread_metrics()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_thread_id uuid;
begin
  if tg_op = 'DELETE' then v_thread_id := old.thread_id; else v_thread_id := new.thread_id; end if;
  update public.forum_threads thread
  set reply_count = (select count(*)::integer from public.forum_replies reply where reply.thread_id = v_thread_id),
      last_reply_at = coalesce((select max(reply.created_at) from public.forum_replies reply where reply.thread_id = v_thread_id), thread.created_at)
  where thread.id = v_thread_id;

  if tg_op = 'UPDATE' and old.thread_id is distinct from new.thread_id then
    update public.forum_threads thread
    set reply_count = (select count(*)::integer from public.forum_replies reply where reply.thread_id = old.thread_id),
        last_reply_at = coalesce((select max(reply.created_at) from public.forum_replies reply where reply.thread_id = old.thread_id), thread.created_at)
    where thread.id = old.thread_id;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists forum_replies_sync_thread_metrics on public.forum_replies;
create trigger forum_replies_sync_thread_metrics
after insert or update or delete on public.forum_replies
for each row execute function public.sync_forum_thread_metrics();

create or replace function public.sync_forum_category_metrics()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_category_id uuid;
begin
  if tg_op = 'DELETE' then v_category_id := old.category_id; else v_category_id := new.category_id; end if;
  update public.forum_categories category
  set thread_count = (select count(*)::integer from public.forum_threads thread where thread.category_id = v_category_id)
  where category.id = v_category_id;

  if tg_op = 'UPDATE' and old.category_id is distinct from new.category_id then
    update public.forum_categories category
    set thread_count = (select count(*)::integer from public.forum_threads thread where thread.category_id = old.category_id)
    where category.id = old.category_id;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists forum_threads_sync_category_metrics on public.forum_threads;
create trigger forum_threads_sync_category_metrics
after insert or update of category_id or delete on public.forum_threads
for each row execute function public.sync_forum_category_metrics();

update public.forum_threads thread
set reply_count = (select count(*)::integer from public.forum_replies reply where reply.thread_id = thread.id),
    last_reply_at = coalesce((select max(reply.created_at) from public.forum_replies reply where reply.thread_id = thread.id), thread.created_at);

update public.forum_categories category
set thread_count = (select count(*)::integer from public.forum_threads thread where thread.category_id = category.id);

revoke all on function public.sync_forum_thread_metrics() from public, anon, authenticated;
revoke all on function public.sync_forum_category_metrics() from public, anon, authenticated;
