-- Browser sessions may create social notifications only as themselves.
-- System notifications are inserted with the service-role client.

drop policy if exists "System inserts notifications" on public.notifications;
drop policy if exists notifications_actor_insert on public.notifications;
create policy notifications_actor_insert on public.notifications
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and user_id is not null
    and user_id <> (select auth.uid())
  );
