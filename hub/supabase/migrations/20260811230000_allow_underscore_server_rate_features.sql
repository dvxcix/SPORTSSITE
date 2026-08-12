-- Server features are named with snake_case throughout the application.
-- The previous validator allowed only hyphens, so valid calls such as
-- whop_checkout and whop_cancel returned false before a counter was created.
-- That made every request look rate-limited. Keep the atomic implementation
-- and least-privilege grants while accepting the established key format.

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
  if p_user_id is null or p_feature !~ '^[a-z0-9_-]{2,40}$' then return false; end if;
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

revoke all on function public.consume_server_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_server_rate_limit(uuid, text, integer, integer) to service_role;
