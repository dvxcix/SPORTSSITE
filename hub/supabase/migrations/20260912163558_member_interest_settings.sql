alter table public.users
  add column if not exists interest_settings jsonb not null default '{}'::jsonb;

alter table public.users
  drop constraint if exists users_interest_settings_object;

alter table public.users
  add constraint users_interest_settings_object
  check (jsonb_typeof(interest_settings) = 'object');

comment on column public.users.interest_settings is
  'Private member content, market, and discovery preferences used for personalization.';
