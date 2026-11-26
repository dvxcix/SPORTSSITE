-- Extend the existing service-only atomic preference merge for the iOS
-- player-news switch. Keep its concurrency checks and grants intact.
do $$
declare
  target oid := 'public.save_account_preferences(uuid,text,jsonb,jsonb)'::regprocedure;
  original text;
  repaired text;
begin
  if (select md5(prosrc) from pg_catalog.pg_proc where oid = target)
     is distinct from '63475aa98fe8533940de1c3e18ac0c8a' then
    raise exception 'Unexpected account preference function';
  end if;
  select pg_catalog.pg_get_functiondef(target) into original;
  repaired := replace(original, '''lineup_confirmed_email''))', '''lineup_confirmed_email'',''player_news''))');
  if repaired is not distinct from original then
    raise exception 'Player news preference allowlist was not found';
  end if;
  execute repaired;
  if pg_catalog.has_function_privilege('anon', target, 'execute')
     or pg_catalog.has_function_privilege('authenticated', target, 'execute')
     or not pg_catalog.has_function_privilege('service_role', target, 'execute') then
    raise exception 'Unexpected account preference grants';
  end if;
end $$;
