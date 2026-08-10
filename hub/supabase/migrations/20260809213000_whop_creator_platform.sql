-- Whop Platforms creator marketplace foundation.
-- All writes that affect money or access are performed by authenticated server routes.

alter table public.users
  add column if not exists whop_connected_company_id text,
  add column if not exists creator_commerce_status text not null default 'not_started',
  add column if not exists creator_commerce_updated_at timestamptz;

alter table public.groups
  add column if not exists access_type text not null default 'free',
  add column if not exists creator_product_id uuid,
  add column if not exists approval_required boolean not null default false;

alter table public.channels
  add column if not exists group_id uuid references public.groups(id) on delete cascade,
  add column if not exists creator_product_id uuid;

alter table public.posts
  add column if not exists creator_product_id uuid,
  add column if not exists preview_text text;

alter table public.picks
  add column if not exists creator_product_id uuid;

create table if not exists public.creator_products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text,
  product_type text not null default 'membership' check (product_type in ('membership','one_time')),
  billing_period_days integer,
  price numeric(10,2) not null check (price > 0),
  currency text not null default 'usd',
  platform_fee_amount numeric(10,2) not null default 0 check (platform_fee_amount >= 0 and platform_fee_amount < price),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  whop_product_id text,
  whop_plan_id text,
  whop_checkout_configuration_id text,
  purchase_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.groups drop constraint if exists groups_creator_product_id_fkey;
alter table public.groups add constraint groups_creator_product_id_fkey foreign key (creator_product_id) references public.creator_products(id) on delete set null;
alter table public.channels drop constraint if exists channels_creator_product_id_fkey;
alter table public.channels add constraint channels_creator_product_id_fkey foreign key (creator_product_id) references public.creator_products(id) on delete set null;
alter table public.posts drop constraint if exists posts_creator_product_id_fkey;
alter table public.posts add constraint posts_creator_product_id_fkey foreign key (creator_product_id) references public.creator_products(id) on delete set null;
alter table public.picks drop constraint if exists picks_creator_product_id_fkey;
alter table public.picks add constraint picks_creator_product_id_fkey foreign key (creator_product_id) references public.creator_products(id) on delete set null;

create table if not exists public.creator_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  creator_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.creator_products(id) on delete cascade,
  whop_membership_id text,
  status text not null default 'active' check (status in ('active','trialing','past_due','canceled','expired','revoked')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, product_id)
);

create table if not exists public.creator_commerce_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.users(id) on delete set null,
  product_id uuid references public.creator_products(id) on delete set null,
  event_type text not null,
  provider text not null default 'whop',
  provider_event_id text unique,
  provider_object_id text,
  amount numeric(10,2),
  currency text,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creator_products_creator_status_idx on public.creator_products(creator_id, status);
create index if not exists creator_entitlements_user_status_idx on public.creator_entitlements(user_id, status);
create index if not exists creator_entitlements_product_idx on public.creator_entitlements(product_id);
create index if not exists creator_commerce_events_creator_created_idx on public.creator_commerce_events(creator_id, created_at desc);

alter table public.creator_products enable row level security;
alter table public.creator_entitlements enable row level security;
alter table public.creator_commerce_events enable row level security;

drop policy if exists "Public can view active creator products" on public.creator_products;
create policy "Public can view active creator products" on public.creator_products for select
  using (status = 'active' or creator_id = (select auth.uid()));
drop policy if exists "Creators manage own products" on public.creator_products;

drop policy if exists "Members view own creator entitlements" on public.creator_entitlements;
create policy "Members view own creator entitlements" on public.creator_entitlements for select to authenticated
  using (user_id = (select auth.uid()) or creator_id = (select auth.uid()));

drop policy if exists "Creators view own commerce events" on public.creator_commerce_events;
create policy "Creators view own commerce events" on public.creator_commerce_events for select to authenticated
  using (creator_id = (select auth.uid()));

revoke insert, update, delete on public.creator_products from authenticated;
grant select on public.creator_products to authenticated;
grant select on public.creator_entitlements, public.creator_commerce_events to authenticated;

-- Paid access is enforced in Postgres, not hidden only by the client UI.
drop policy if exists "Groups are viewable by all" on public.groups;
create policy "Groups respect creator access" on public.groups for select
  using (
    (access_type = 'free' and is_public)
    or owner_id = (select auth.uid())
    or exists (select 1 from public.group_members gm where gm.group_id = groups.id and gm.user_id = (select auth.uid()))
    or exists (select 1 from public.creator_entitlements ce where ce.product_id = groups.creator_product_id and ce.user_id = (select auth.uid()) and ce.status in ('active','trialing') and (ce.current_period_end is null or ce.current_period_end > now()))
  );

drop policy if exists "Public channels viewable" on public.channels;
create policy "Channels respect creator access" on public.channels for select
  using (
    (channel_type = 'public' and creator_product_id is null)
    or owner_id = (select auth.uid())
    or exists (select 1 from public.channel_members cm where cm.channel_id = channels.id and cm.user_id = (select auth.uid()))
    or exists (select 1 from public.creator_entitlements ce where ce.product_id = channels.creator_product_id and ce.user_id = (select auth.uid()) and ce.status in ('active','trialing') and (ce.current_period_end is null or ce.current_period_end > now()))
  );

drop policy if exists "Public picks viewable" on public.picks;
create policy "Picks respect creator access" on public.picks for select
  using (
    creator_product_id is null
    or user_id = (select auth.uid())
    or exists (select 1 from public.creator_entitlements ce where ce.product_id = picks.creator_product_id and ce.user_id = (select auth.uid()) and ce.status in ('active','trialing') and (ce.current_period_end is null or ce.current_period_end > now()))
  );

drop policy if exists "Posts viewable by author, followers, or public (if not private " on public.posts;
create policy "Posts respect visibility and creator access" on public.posts for select
  using (
    author_id = (select auth.uid())
    or (
      creator_product_id is null
      and ((visibility = 'public' and not exists (select 1 from public.users u where u.id = posts.author_id and u.is_private))
        or exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.following_id = posts.author_id))
    )
    or exists (select 1 from public.creator_entitlements ce where ce.product_id = posts.creator_product_id and ce.user_id = (select auth.uid()) and ce.status in ('active','trialing') and (ce.current_period_end is null or ce.current_period_end > now()))
  );

drop policy if exists "Admins or owner (pending) can update application" on public.creator_applications;
create policy "Applicants edit pending applications" on public.creator_applications for update to authenticated
  using (user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid()) and status = 'pending');
