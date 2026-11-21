-- Additive, private member defaults. No historical migration replay or backfill.
create function public.valid_member_research_preferences(p_value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; seen text[] := '{}';
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object' then return false; end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_value)) <> 4
     or not (p_value ?& array['version','launchPage','books','primaryBook'])
     or p_value->'version' <> '1'::jsonb
     or pg_catalog.jsonb_typeof(p_value->'launchPage') <> 'string'
     or pg_catalog.jsonb_typeof(p_value->'books') <> 'array' then return false; end if;
  if not (p_value->>'launchPage' = any(array[
    'feed','picks','sports','bookmarks','workspace','activity','missions','explore','community','leaderboard','messages','notifications',
    'court','nba-odds-board','nba-odds','nba-ladders','nba-movement','nba-first-basket','nba-cheatsheets','nba-trends','nba-tracking','nba-score','nba-slate','nba-dvp','nba-cross-market','nba-matchup','nba-availability','nba-games','nba-public',
    'sideline','nfl-odds-board','nfl-touchdowns','nfl-props','nfl-usage','nfl-tracking','nfl-team','nfl-all','nfl-custom','nfl-public','nfl-books','nfl-cheatsheets','nfl-matchup'
  ])) or pg_catalog.jsonb_array_length(p_value->'books') > 11 then return false; end if;
  for item in select value from pg_catalog.jsonb_array_elements(p_value->'books') loop
    if pg_catalog.jsonb_typeof(item) <> 'string'
       or not (item #>> '{}' = any(array['fanduel','draftkings','betmgm','caesars','fanatics','betrivers','betparx','ballybet','pinnacle','kalshi','polymarket']))
       or (item #>> '{}') = any(seen) then return false; end if;
    seen := pg_catalog.array_append(seen, item #>> '{}');
  end loop;
  if pg_catalog.cardinality(seen) = 0 then return p_value->'primaryBook' = 'null'::jsonb; end if;
  return pg_catalog.jsonb_typeof(p_value->'primaryBook') = 'string' and p_value->>'primaryBook' = any(seen);
end;
$$;
revoke all on function public.valid_member_research_preferences(jsonb) from public, anon, authenticated;
grant execute on function public.valid_member_research_preferences(jsonb) to service_role;

create table public.member_research_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  preferences jsonb not null default '{"version":1,"launchPage":"feed","books":[],"primaryBook":null}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint member_research_preferences_valid check (public.valid_member_research_preferences(preferences))
);
alter table public.member_research_preferences enable row level security;
revoke all on table public.member_research_preferences from public, anon, authenticated;
grant select on table public.member_research_preferences to authenticated;
grant select, insert, update on table public.member_research_preferences to service_role;
create policy member_research_preferences_owner_read on public.member_research_preferences
  for select to authenticated using ((select auth.uid()) = user_id);

-- Service-only CAS: the HTTP handler obtains p_user_id from the verified session.
-- Serialize missing-row inserts as well as updates. A stale editor receives false.
create function public.save_member_research_preferences(p_user_id uuid, p_preferences jsonb, p_expected jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_value jsonb;
begin
  if p_user_id is null or not public.valid_member_research_preferences(p_preferences)
     or not public.valid_member_research_preferences(p_expected) then
    raise exception 'Invalid research preferences' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('member-research-preferences:' || p_user_id::text, 0));
  select preferences into current_value from public.member_research_preferences where user_id = p_user_id for update;
  current_value := coalesce(current_value, '{"version":1,"launchPage":"feed","books":[],"primaryBook":null}'::jsonb);
  if current_value <> p_expected then return false; end if;
  insert into public.member_research_preferences (user_id, preferences, updated_at)
    values (p_user_id, p_preferences, pg_catalog.now())
    on conflict (user_id) do update set preferences = excluded.preferences, updated_at = excluded.updated_at;
  return true;
end;
$$;
revoke all on function public.save_member_research_preferences(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_member_research_preferences(uuid,jsonb,jsonb) to service_role;
comment on table public.member_research_preferences is 'Private sportsbook and launch-page defaults; owner read, service-only validated CAS writes.';
