create table if not exists public.native_storekit_subscriptions (
  environment text not null check (environment in ('Production', 'Sandbox')),
  original_transaction_id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  transaction_id text not null,
  product_id text not null,
  purchased_at timestamptz not null,
  event_at timestamptz not null,
  from_notification boolean not null,
  access_until timestamptz,
  primary key (environment, original_transaction_id)
);

create index if not exists native_storekit_subscriptions_member_access
  on public.native_storekit_subscriptions (user_id, environment, access_until desc)
  where access_until is not null;

alter table public.native_storekit_subscriptions enable row level security;
revoke all on table public.native_storekit_subscriptions from public, anon, authenticated;
grant select, insert, update on table public.native_storekit_subscriptions to service_role;

-- The server verifies the signer, product and Apple account token before calling.
-- A delayed device restore cannot overwrite a newer renewal or a server event.
create or replace function public.record_native_storekit_subscription(
  p_environment text, p_original_transaction_id text, p_user_id uuid,
  p_transaction_id text, p_product_id text, p_purchased_at timestamptz,
  p_event_at timestamptz, p_from_notification boolean, p_access_until timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.native_storekit_subscriptions as stored (
    environment, original_transaction_id, user_id, transaction_id, product_id,
    purchased_at, event_at, from_notification, access_until
  ) values (
    p_environment, p_original_transaction_id, p_user_id, p_transaction_id, p_product_id,
    p_purchased_at, p_event_at, p_from_notification, p_access_until
  )
  on conflict (environment, original_transaction_id) do update
    set transaction_id = excluded.transaction_id,
        product_id = excluded.product_id,
        purchased_at = excluded.purchased_at,
        event_at = excluded.event_at,
        from_notification = excluded.from_notification,
        access_until = excluded.access_until
    where stored.user_id = excluded.user_id and (
      excluded.purchased_at > stored.purchased_at
      or (excluded.purchased_at = stored.purchased_at and excluded.transaction_id = stored.transaction_id and (
        (excluded.from_notification and (not stored.from_notification or excluded.event_at >= stored.event_at))
        or (not excluded.from_notification and not stored.from_notification and excluded.event_at >= stored.event_at)
      ))
    );

  return exists (
    select 1 from public.native_storekit_subscriptions
    where environment = p_environment
      and original_transaction_id = p_original_transaction_id
      and user_id = p_user_id
  );
end;
$$;

revoke all on function public.record_native_storekit_subscription(text, text, uuid, text, text, timestamptz, timestamptz, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_native_storekit_subscription(text, text, uuid, text, text, timestamptz, timestamptz, boolean, timestamptz)
  to service_role;
