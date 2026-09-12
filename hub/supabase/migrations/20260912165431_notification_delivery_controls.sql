alter table public.users
  add column if not exists notification_delivery_settings jsonb not null default jsonb_build_object(
    'quiet_hours_enabled', false,
    'quiet_start', '22:00',
    'quiet_end', '07:00',
    'timezone', 'America/New_York',
    'live_game_priority', true
  );

alter table public.users
  drop constraint if exists users_notification_delivery_settings_object;
alter table public.users
  add constraint users_notification_delivery_settings_object
  check (jsonb_typeof(notification_delivery_settings) = 'object');

comment on column public.users.notification_delivery_settings is
  'Private delivery timing and live-game priority controls for push and email notifications.';
