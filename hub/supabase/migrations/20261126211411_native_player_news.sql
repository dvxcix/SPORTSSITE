-- Service-only snapshots and delivery outbox. The initial poll records
-- observations without publishing existing injury reports or transactions.
create table public.native_player_news_sources (
  source text primary key check (source in ('nba-injuries','nfl-injuries','nba-transactions','nfl-transactions','mlb-transactions')),
  observed_at timestamptz,
  injury_statuses jsonb not null default '{}'::jsonb
);

create table public.native_player_news_outbox (
  source text not null references public.native_player_news_sources(source),
  event_key text not null check (event_key ~ '^[a-f0-9]{64}$'),
  event jsonb not null check (jsonb_typeof(event) = 'object'),
  deliver_until timestamptz not null,
  published_at timestamptz,
  primary key (source, event_key)
);

create index native_player_news_pending on public.native_player_news_outbox (deliver_until, source, event_key)
  where published_at is null;

alter table public.native_player_news_sources enable row level security;
alter table public.native_player_news_outbox enable row level security;
revoke all on public.native_player_news_sources, public.native_player_news_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.native_player_news_sources, public.native_player_news_outbox to service_role;

create function public.record_native_player_news(
  p_source text, p_observed_at timestamptz, p_items jsonb
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous timestamptz;
  v_before jsonb;
  v_after jsonb;
  v_new integer;
begin
  if p_observed_at is null or p_observed_at < now() - interval '15 minutes'
     or p_observed_at > now() + interval '1 minute'
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) > 2000 or pg_column_size(p_items) > 2000000 then
    raise exception 'invalid player news observations';
  end if;

  insert into public.native_player_news_sources (source)
  values (p_source) on conflict (source) do nothing;
  select observed_at, injury_statuses into v_previous, v_before
  from public.native_player_news_sources where source = p_source for update;

  if v_previous >= p_observed_at then return 0; end if;

  -- Keep the newest provider report per named subject. Missing subjects are
  -- never considered recovered. Only an explicit active report can do that.
  with items as (
    select value as item, value->>'subject' as subject, value->>'status' as status,
      (value->>'reportedAt')::timestamptz as reported_at
    from jsonb_array_elements(p_items)
  ), latest as (
    select distinct on (subject) item, subject, status, reported_at from items
    where subject is not null and status is not null and reported_at <= p_observed_at
    order by subject, reported_at desc, item->>'key'
  ), accepted as (
    select item, subject, status, reported_at from latest
    where not (v_before ? subject) or reported_at > (v_before->subject->>'at')::timestamptz
  ), queued as (
    insert into public.native_player_news_outbox (source, event_key, event, deliver_until, published_at)
    select p_source, queued.item->>'key', queued.item, p_observed_at + interval '45 minutes',
      case when v_previous is null or v_previous < p_observed_at - interval '6 hours'
         or queued.reported_at < p_observed_at - interval '42 hours'
         or (queued.status like 'Active:%' and coalesce(v_before->queued.subject->>'status','Active:') like 'Active:%')
      then p_observed_at end
    from (
      select item, subject, status, reported_at from items
        where subject is null and reported_at <= p_observed_at
      union all
      select item, subject, status, reported_at from accepted
        where coalesce(v_before->subject->>'status','') <> status
    ) queued
    on conflict (source, event_key) do nothing
    returning published_at
  )
  select count(*) filter (where published_at is null), (select coalesce(jsonb_object_agg(subject, jsonb_build_object(
    'status', status, 'at', reported_at
  )), '{}'::jsonb) from accepted) into v_new, v_after from queued;

  update public.native_player_news_sources set observed_at = p_observed_at,
    injury_statuses = coalesce((
      select jsonb_object_agg(entry.key, entry.value) from jsonb_each(v_before || v_after) entry
      where (entry.value->>'at')::timestamptz >= p_observed_at - interval '120 days'
    ), '{}'::jsonb)
  where source = p_source;
  return v_new;
end
$$;

revoke all on function public.record_native_player_news(text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.record_native_player_news(text,timestamptz,jsonb) to service_role;

-- A TestFlight-only member may have an Apple device and no browser
-- subscription. Both transports use the same authenticated webhook.
create or replace function public.notify_push_on_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  trigger_secret text;
  settings jsonb;
  setting_key text;
begin
  setting_key := case new.type
    when 'follow' then 'new_follower'
    when 'reaction' then 'post_reaction'
    when 'comment' then 'post_comment'
    when 'mention' then 'mention'
    when 'pick_result' then 'pick_result'
    when 'message' then 'dm'
    when 'subscription' then 'subscription'
    when 'repost' then 'repost'
    when 'group_invite' then 'group_invite'
    when 'new_pick' then 'new_pick'
    when 'lineup_confirmed' then 'lineup_confirmed'
    when 'injury_update' then 'player_news'
    when 'roster_move' then 'player_news'
    else null
  end;

  select u.notification_settings into settings
  from public.users u
  where u.id = new.user_id;

  if setting_key = 'player_news' then
    if new.actor_id is not null or settings->'player_news' is distinct from 'true'::jsonb then
      return new;
    end if;
  elsif setting_key is not null and coalesce((settings ->> setting_key)::boolean, true) is false then
    return new;
  end if;

  if not exists (
    select 1 from public.native_apple_push_devices d where d.user_id = new.user_id
      and d.updated_at >= now() - interval '30 days'
  ) and (setting_key = 'player_news' or not exists (
    select 1 from public.push_subscriptions ps where ps.user_id = new.user_id
  )) then
    return new;
  end if;

  select decrypted_secret into trigger_secret
  from vault.decrypted_secrets where name = 'push_trigger_secret' limit 1;

  perform net.http_post(
    url := 'https://www.slipsurge.com/api/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(trigger_secret, '')
    ),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$function$;

revoke all on function public.notify_push_on_insert() from public, anon, authenticated;
