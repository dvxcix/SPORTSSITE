alter table public.changelog_entries
  add column if not exists audience_tier text not null default 'all';

alter table public.changelog_entries
  drop constraint if exists changelog_entries_audience_tier_check;

alter table public.changelog_entries
  add constraint changelog_entries_audience_tier_check
  check (audience_tier in ('all', 'ultimate'));

drop policy if exists "Changelog viewable by all" on public.changelog_entries;
drop policy if exists "Changelog viewable by audience" on public.changelog_entries;

create policy "Changelog viewable by audience"
  on public.changelog_entries
  for select
  to authenticated
  using (
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
              or u.account_type = 'admin'
              or u.beta_access_active = true
            )
        )
      )
    )
  );

revoke all on table public.changelog_entries from anon;
revoke truncate, references, trigger on table public.changelog_entries from authenticated;
grant select, insert, update, delete on table public.changelog_entries to authenticated;

revoke all on table public.changelog_dismissals from anon;
revoke update, delete, truncate, references, trigger on table public.changelog_dismissals from authenticated;
grant select, insert on table public.changelog_dismissals to authenticated;
