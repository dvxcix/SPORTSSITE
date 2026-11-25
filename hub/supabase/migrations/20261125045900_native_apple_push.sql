-- APNs registrations are service-owned and separate from browser push endpoints.
create table public.native_apple_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null check (token ~ '^[0-9a-f]{32,512}$' and length(token) % 2 = 0),
  topic text not null check (topic ~ '^[A-Za-z0-9.-]{3,150}$'),
  environment text not null check (environment in ('development','production')),
  updated_at timestamptz not null default now(),
  unique (environment, topic, token)
);

create index native_apple_push_devices_owner_idx on public.native_apple_push_devices (user_id, updated_at desc);
alter table public.native_apple_push_devices enable row level security;
revoke all on public.native_apple_push_devices from public, anon, authenticated;
grant select, insert, update, delete on public.native_apple_push_devices to service_role;

create table public.native_apple_push_deliveries (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  device_id uuid not null references public.native_apple_push_devices(id) on delete cascade,
  status text not null check (status in ('sending','sent','failed')),
  provider_status integer,
  attempted_at timestamptz not null default now(),
  primary key (notification_id, device_id)
);

create index native_apple_push_deliveries_device_idx on public.native_apple_push_deliveries (device_id);
alter table public.native_apple_push_deliveries enable row level security;
revoke all on public.native_apple_push_deliveries from public, anon, authenticated;
grant select, insert, update on public.native_apple_push_deliveries to service_role;
