drop policy if exists "Admins manage changelog" on public.changelog_entries;
drop policy if exists "Changelog viewable by audience" on public.changelog_entries;
drop policy if exists "Admins insert changelog" on public.changelog_entries;
drop policy if exists "Admins update changelog" on public.changelog_entries;
drop policy if exists "Admins delete changelog" on public.changelog_entries;

create policy "Changelog select by audience"
on public.changelog_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.account_type = 'admin'
  )
  or (
    is_active
    and (
      audience_tier = 'all'
      or (
        audience_tier = 'ultimate'
        and exists (
          select 1
          from public.users u
          where u.id = (select auth.uid())
            and (
              u.tier = 'ultimate'
              or u.admin_granted_tier = 'ultimate'
              or u.beta_access_active = true
            )
        )
      )
    )
  )
);

create policy "Admins insert changelog"
on public.changelog_entries
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.account_type = 'admin'
  )
);

create policy "Admins update changelog"
on public.changelog_entries
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.account_type = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.account_type = 'admin'
  )
);

create policy "Admins delete changelog"
on public.changelog_entries
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.account_type = 'admin'
  )
);
