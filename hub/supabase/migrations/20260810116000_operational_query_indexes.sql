-- Index the production queues and retention paths used by admin operations.

create index if not exists notifications_created_at_idx
  on public.notifications (created_at);
create index if not exists notifications_type_created_at_idx
  on public.notifications (type, created_at);
create index if not exists notifications_read_created_at_idx
  on public.notifications (read, created_at)
  where read = true;

create index if not exists creator_applications_status_created_at_idx
  on public.creator_applications (status, created_at desc);

create index if not exists creator_entitlements_creator_status_idx
  on public.creator_entitlements (creator_id, status);
create index if not exists creator_entitlements_product_status_idx
  on public.creator_entitlements (product_id, status);

comment on index public.notifications_created_at_idx is
  'Supports bounded notification retention without scanning the full notification table.';
