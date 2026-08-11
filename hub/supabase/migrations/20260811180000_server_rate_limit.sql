-- Atomic, service-only rate limiting for server routes that can incur
-- third-party cost. Browser clients cannot invoke or choose these limits.

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
  v_window_start timestamptz;
  v_count integer;
begin
  if auth.role() <> 'service_role' then return false; end if;
  if p_user_id is null or p_feature !~ '^[a-z0-9-]{2,40}$' then return false; end if;
  if p_max < 1 or p_max > 100 or p_window_seconds < 1 or p_window_seconds > 86400 then return false; end if;

  v_key := 'server:' || p_feature || ':' || p_user_id::text;
  select window_start, count into v_window_start, v_count
  from public.rate_limit_counters where key = v_key for update;

  if not found or v_window_start < now() - make_interval(secs => p_window_seconds) then
    insert into public.rate_limit_counters (key, window_start, count)
    values (v_key, now(), 1)
    on conflict (key) do update set window_start = now(), count = 1;
    return true;
  end if;

  if v_count >= p_max then return false; end if;
  update public.rate_limit_counters set count = count + 1 where key = v_key;
  return true;
end;
$$;

revoke all on function public.consume_server_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_server_rate_limit(uuid, text, integer, integer) to service_role;
