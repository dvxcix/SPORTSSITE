-- Make both browser-policy and server-side counters atomic under concurrent
-- requests. The former select-then-insert path could reset parallel first
-- requests to count=1 through ON CONFLICT, weakening the limit on bursts.

create or replace function private.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_prefix text := split_part(p_key, ':', 1);
  v_now timestamptz := now();
  v_count integer;
begin
  if v_uid is null or p_key <> v_prefix || ':' || v_uid::text then return false; end if;
  if not (
    (v_prefix = 'block' and p_max = 20 and p_window_seconds = 60) or
    (v_prefix = 'comment' and p_max = 30 and p_window_seconds = 60) or
    (v_prefix = 'follow' and p_max = 30 and p_window_seconds = 60) or
    (v_prefix = 'message' and p_max = 60 and p_window_seconds = 60) or
    (v_prefix = 'post' and p_max = 10 and p_window_seconds = 300) or
    (v_prefix = 'reaction' and p_max = 60 and p_window_seconds = 60)
  ) then return false; end if;

  insert into public.rate_limit_counters as counters (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    window_start = case
      when counters.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
      else counters.window_start
    end,
    count = case
      when counters.window_start < v_now - make_interval(secs => p_window_seconds) then 1
      else least(counters.count + 1, p_max + 1)
    end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

create or replace function public.consume_server_rate_limit(
  p_user_id uuid,
  p_feature text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_now timestamptz := now();
  v_count integer;
begin
  if auth.role() <> 'service_role' then return false; end if;
  if p_user_id is null or p_feature !~ '^[a-z0-9-]{2,40}$' then return false; end if;
  if p_max < 1 or p_max > 100 or p_window_seconds < 1 or p_window_seconds > 86400 then return false; end if;

  v_key := 'server:' || p_feature || ':' || p_user_id::text;
  insert into public.rate_limit_counters as counters (key, window_start, count)
  values (v_key, v_now, 1)
  on conflict (key) do update set
    window_start = case
      when counters.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
      else counters.window_start
    end,
    count = case
      when counters.window_start < v_now - make_interval(secs => p_window_seconds) then 1
      else least(counters.count + 1, p_max + 1)
    end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

revoke all on function private.check_rate_limit(text, integer, integer) from public, anon;
grant execute on function private.check_rate_limit(text, integer, integer) to authenticated, service_role;
revoke all on function public.consume_server_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_server_rate_limit(uuid, text, integer, integer) to service_role;
