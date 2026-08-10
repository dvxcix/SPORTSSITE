-- Cover foreign keys used by cascading cleanup and administrative lookups.

create index if not exists account_deletion_reviewed_by_idx
  on public.account_deletion_requests (reviewed_by)
  where reviewed_by is not null;

create index if not exists notification_delivery_user_idx
  on public.notification_delivery_attempts (user_id)
  where user_id is not null;

create index if not exists notification_delivery_subscription_idx
  on public.notification_delivery_attempts (subscription_id)
  where subscription_id is not null;
