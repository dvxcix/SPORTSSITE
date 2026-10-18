-- Approved and applied individually to SlipSurge production; do not replay historical migrations.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
do $guard$ begin
 if to_regclass('public.creator_funnel_events') is not null then raise exception 'Repair precondition failed: creator_funnel_events already exists; reconcile schema first'; end if;
end $guard$;
create table if not exists public.creator_funnel_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.users(id) on delete cascade,
  product_id uuid references public.creator_products(id) on delete cascade,
  viewer_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('storefront_view', 'offer_view', 'checkout_started')),
  session_id uuid not null,
  source text not null default 'direct' check (source in ('direct', 'feed', 'profile', 'community', 'search', 'external')),
  created_at timestamptz not null default now()
);

create unique index if not exists creator_funnel_events_session_unique
  on public.creator_funnel_events (
    creator_id,
    event_type,
    session_id,
    coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists creator_funnel_events_creator_recent
  on public.creator_funnel_events(creator_id, created_at desc);
create index if not exists creator_funnel_events_product_recent
  on public.creator_funnel_events(product_id, created_at desc)
  where product_id is not null;

alter table public.creator_funnel_events enable row level security;

create policy "Creators read own funnel analytics"
on public.creator_funnel_events for select to authenticated
using (creator_id = (select auth.uid()));

revoke all on public.creator_funnel_events from public, anon, authenticated;
grant select on public.creator_funnel_events to authenticated;

-- Creator storefront analytics accepts signed-out visitors, so it cannot use
-- private.check_rate_limit: that helper deliberately requires auth.uid() and
-- a member-keyed counter. Keep this RPC atomic while limiting each browser
-- session independently for each creator.
create or replace function public.record_creator_funnel_event(
  p_creator_id uuid,
  p_product_id uuid,
  p_event_type text,
  p_session_id uuid,
  p_source text default 'direct'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_now timestamptz := now();
  v_count integer;
  v_rate_key text := 'creator-funnel:' || p_session_id::text || ':' || p_creator_id::text;
begin
  if p_session_id is null then raise exception using errcode='22023',message='Session required'; end if;
  if p_event_type is null or p_event_type not in ('storefront_view', 'offer_view', 'checkout_started') then
    raise exception using errcode = '22023', message = 'Invalid funnel event';
  end if;
  if p_source is null or p_source not in ('direct', 'feed', 'profile', 'community', 'search', 'external') then
    p_source := 'direct';
  end if;
  if not exists (
    select 1 from public.users creator
    where creator.id = p_creator_id and creator.account_type in ('creator', 'admin')
  ) then
    raise exception using errcode = '22023', message = 'Creator unavailable';
  end if;
  if p_product_id is not null and not exists (
    select 1 from public.creator_products product
    where product.id = p_product_id and product.creator_id = p_creator_id and product.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'Offer unavailable';
  end if;

  insert into public.rate_limit_counters as counters (key, window_start, count)
  values (v_rate_key, v_now, 1)
  on conflict (key) do update set
    window_start = case when counters.window_start < v_now - interval '1 day' then v_now else counters.window_start end,
    count = case when counters.window_start < v_now - interval '1 day' then 1 else least(counters.count + 1, 13) end
  returning count into v_count;
  if v_count > 12 then return false; end if;

  insert into public.creator_funnel_events (
    creator_id, product_id, viewer_id, event_type, session_id, source
  ) values (
    p_creator_id, p_product_id, v_viewer_id, p_event_type, p_session_id, p_source
  ) on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.record_creator_funnel_event(uuid, uuid, text, uuid, text) from public;
grant execute on function public.record_creator_funnel_event(uuid, uuid, text, uuid, text) to anon, authenticated;

grant all on table public.creator_funnel_events to service_role;
commit;
