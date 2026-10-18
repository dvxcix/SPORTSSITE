-- Approved and applied individually to SlipSurge production; do not replay historical migrations.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
revoke all on function public.create_group_conversation(text,uuid[]) from public,anon;
grant execute on function public.create_group_conversation(text,uuid[]) to authenticated;
commit;
