-- PostgreSQL regular expressions only accept bounded repetition up to 255.
-- Keep the registration API's 32–512 hex character contract.
alter table public.native_apple_push_devices
  drop constraint native_apple_push_devices_token_check,
  add constraint native_apple_push_devices_token_check
    check (length(token) between 32 and 512 and length(token) % 2 = 0 and token ~ '^[0-9a-f]+$');

create table public.native_game_alert_subscriptions (
  user_id uuid not null references public.users(id) on delete cascade,
  sport text not null check (sport in ('nfl', 'nba', 'mlb')),
  game_id text not null check (game_id ~ '^([0-9]{1,14}|[0-9]{4}_[0-9]{2}_[A-Z]{2,3}_[A-Z]{2,3})$'),
  game_date date not null,
  scoring boolean not null default true,
  major boolean not null default true,
  milestone boolean not null default true,
  subscribed_at timestamptz not null default now(),
  primary key (user_id, sport, game_id),
  check (scoring or major or milestone)
);

create index native_game_alert_subscriptions_date_idx
  on public.native_game_alert_subscriptions (game_date, sport, game_id, user_id);

create table public.native_game_alert_deliveries (
  device_id uuid not null references public.native_apple_push_devices(id) on delete cascade,
  sport text not null,
  game_id text not null,
  event_key text not null,
  provider_id uuid not null default gen_random_uuid(),
  attempted_at timestamptz not null default now(),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_status integer,
  primary key (device_id, sport, game_id, event_key)
);

create index native_game_alert_deliveries_retention_idx on public.native_game_alert_deliveries (attempted_at);

alter table public.native_game_alert_subscriptions enable row level security;
alter table public.native_game_alert_deliveries enable row level security;
revoke all on public.native_game_alert_subscriptions, public.native_game_alert_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.native_game_alert_subscriptions, public.native_game_alert_deliveries to service_role;

create function public.claim_native_game_alert(
  p_device_id uuid, p_user_id uuid, p_sport text, p_game_id text,
  p_event_key text, p_kind text, p_occurred_at timestamptz, p_expires_at timestamptz
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.native_game_alert_deliveries (device_id, sport, game_id, event_key)
  select d.id, s.sport, s.game_id, p_event_key
  from public.native_apple_push_devices d
  join public.native_game_alert_subscriptions s on s.user_id = d.user_id
  where d.id = p_device_id and d.user_id = p_user_id
    and s.sport = p_sport and s.game_id = p_game_id
    and s.subscribed_at <= p_occurred_at
    and p_occurred_at <= now() and p_expires_at > now()
    and p_expires_at <= p_occurred_at + interval '5 minutes'
    and d.updated_at >= now() - interval '30 days'
    and case p_kind when 'scoring' then s.scoring when 'major' then s.major when 'milestone' then s.milestone else false end
  on conflict (device_id, sport, game_id, event_key) do nothing
  returning provider_id;
$$;

revoke execute on function public.claim_native_game_alert(uuid, uuid, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_native_game_alert(uuid, uuid, text, text, text, text, timestamptz, timestamptz) to service_role;
