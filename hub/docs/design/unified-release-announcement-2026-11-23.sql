-- Owner-authorized announcement. Run only after READY production + live checks.
-- Exactly one reviewed entry; preserve earlier notices, flags and dismissals.
begin;
insert into public.changelog_entries
  (id,title,description,how_to_use,screenshot_urls,is_active,created_by,audience_tier)
select
  'e89f7567-69d0-43d8-9a62-074656e51123'::uuid,
  'A clearer way around SlipSurge',
  $notice$Take a look around before joining. Try the NBA and NFL previews, read public posts and browse communities without an account.

Community pages and messages now have simpler navigation. Pick and poll drafts stay in place when you switch post types, and message requests give clearer feedback.

Phone, tablet and desktop layouts have been refined in light and dark. Your research tools, team artwork and player cards are still right where you need them.$notice$,
  $how$New to SlipSurge? Open a free board from the homepage, then browse the Feed or Communities.

Members: use More on community pages for Live rooms, Messages and saved posts. Choose a post type without losing the draft you were working on.

You can return to this update from What's new after closing the alert.$how$,
  '{}'::text[], true, '298a5882-75c6-4bdd-b915-3c43e5cd2f47'::uuid, 'all'
where exists (
  select 1 from public.users where id='298a5882-75c6-4bdd-b915-3c43e5cd2f47'
  and account_type='admin'
)
on conflict (id) do nothing;
do $guard$
begin
  if not exists (
    select 1 from public.changelog_entries
    where id='e89f7567-69d0-43d8-9a62-074656e51123'
    and title='A clearer way around SlipSurge'
    and audience_tier='all' and is_active=true
    and created_by='298a5882-75c6-4bdd-b915-3c43e5cd2f47'
  ) then raise exception 'Reviewed release announcement was not published'; end if;
end
$guard$;
commit;
