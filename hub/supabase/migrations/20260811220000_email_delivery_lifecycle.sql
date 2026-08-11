-- Attach provider lifecycle events to the original notification-email send.
-- These fields contain provider IDs/status metadata only, never raw payloads
-- or message bodies.

alter table public.notification_delivery_attempts
  add column if not exists provider_message_id text,
  add column if not exists provider_event text,
  add column if not exists provider_event_at timestamptz;

create index if not exists notification_delivery_provider_message_idx
  on public.notification_delivery_attempts (provider_message_id)
  where provider_message_id is not null;

comment on table public.notification_delivery_attempts is
  'Server-only delivery telemetry for push and email, including provider lifecycle status.';
