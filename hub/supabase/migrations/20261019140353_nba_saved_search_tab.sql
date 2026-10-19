-- Append NBA to the existing saved-search tab allowlist; preserve every old tab.
begin;
set local lock_timeout = '5s';
do $$
begin
  if (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.saved_searches'::regclass and conname='saved_searches_result_tab_check')
    is distinct from $expected$CHECK ((result_tab = ANY (ARRAY['all'::text, 'users'::text, 'posts'::text, 'picks'::text, 'community'::text, 'mlb'::text, 'nfl'::text])))$expected$ then
    raise exception 'Saved-search tab constraint changed; review before applying';
  end if;
end $$;
alter table public.saved_searches drop constraint saved_searches_result_tab_check;
alter table public.saved_searches add constraint saved_searches_result_tab_check
  check (result_tab in ('all','users','posts','picks','community','mlb','nfl','nba'));
commit;
