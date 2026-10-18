-- Approved and applied individually to SlipSurge production; do not replay historical migrations.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create policy "Group owners read own groups" on public.groups for select to authenticated using (owner_id=(select auth.uid()));
commit;
