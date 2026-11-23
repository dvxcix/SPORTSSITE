-- Store identities are separate from member profiles. Public reads expose only
-- published display fields; draft data and every write remain server-only.
create table public.creator_storefronts (
  creator_id uuid primary key constraint creator_storefronts_creator_id_fkey references public.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  bio text not null default '' check (char_length(bio) <= 1000),
  logo_url text check (char_length(logo_url) <= 2048),
  cover_url text check (char_length(cover_url) <= 2048),
  sports text[] not null default '{}' check (cardinality(sports) <= 8 and sports <@ array['NFL','NBA','MLB','NHL','CFB','CBB','Soccer','MMA']),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  access_mode text not null default 'free' check (access_mode in ('free','paid')),
  setup_step integer not null default 0 check (setup_step between 0 and 4),
  status text not null default 'draft' check (status in ('draft','published')),
  community_id uuid references public.groups(id) on delete set null,
  product_id uuid references public.creator_products(id) on delete set null,
  featured boolean not null default false,
  featured_rank integer not null default 100 check (featured_rank between 0 and 999),
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_store_identity check (status = 'draft' or (char_length(name) >= 2 and char_length(bio) >= 10 and cardinality(sports) > 0))
);
create index creator_storefronts_discovery on public.creator_storefronts(featured desc,featured_rank,updated_at desc) where status='published';
create index creator_storefronts_community on public.creator_storefronts(community_id) where community_id is not null;
create index creator_storefronts_product on public.creator_storefronts(product_id) where product_id is not null;
alter table public.creator_storefronts enable row level security;
revoke all on public.creator_storefronts from public,anon,authenticated;
grant select (creator_id,name,bio,logo_url,cover_url,sports,tags,access_mode,setup_step,status,community_id,product_id,featured,featured_rank,updated_at) on public.creator_storefronts to anon,authenticated;
grant all on public.creator_storefronts to service_role;
create policy "Published stores are discoverable" on public.creator_storefronts for select to anon,authenticated using (status='published');
create policy "Owners can read their store identity" on public.creator_storefronts for select to authenticated using (creator_id=(select auth.uid()));
comment on column public.creator_storefronts.draft is 'Service-only edit draft. Never returned by the public storefront or directory.';
