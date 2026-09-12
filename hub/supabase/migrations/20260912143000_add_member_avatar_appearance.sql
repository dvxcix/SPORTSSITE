alter table public.users
  add column if not exists avatar_ring_style text not null default 'surge',
  add column if not exists avatar_ring_color text not null default '#b6ff3b';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_avatar_ring_style_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_avatar_ring_style_check
      check (avatar_ring_style in ('none', 'solid', 'surge', 'pulse', 'orbit'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_avatar_ring_color_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_avatar_ring_color_check
      check (avatar_ring_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end
$$;
