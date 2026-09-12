create table if not exists public.message_pins (
  user_id uuid not null references public.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create index if not exists idx_message_pins_message
  on public.message_pins(message_id);

alter table public.message_pins enable row level security;

create policy "Members read own message pins"
on public.message_pins for select to authenticated
using (user_id = (select auth.uid()));

create policy "Members pin accessible messages"
on public.message_pins for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.messages message
    where message.id = message_pins.message_id
      and coalesce(message.is_deleted, false) = false
      and private.can_access_message(message.id, (select auth.uid()))
  )
);

create policy "Members remove own message pins"
on public.message_pins for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, delete on public.message_pins to authenticated;
revoke all on public.message_pins from anon;
