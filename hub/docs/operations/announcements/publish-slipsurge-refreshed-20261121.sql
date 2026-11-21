-- Owner approved this exact announcement and artwork on 2026-11-21.
-- Data publication only; no schema migration or historical replay.
-- Run only after the image is available on www.slipsurge.com.
-- Stable ID and exact-payload guards make retries safe without resetting dismissals.
begin;

do $guard$
begin
  if exists (
    select 1 from public.changelog_entries
    where title = 'SlipSurge, refreshed.'
      and id <> '116d8d4f-0a27-4ea3-8dbd-d292cc1be83d'::uuid
  ) then
    raise exception 'Another announcement has this title; inspect before publishing.';
  end if;
end
$guard$;

insert into public.changelog_entries (
  id, title, description, how_to_use, screenshot_urls,
  audience_tier, is_active, created_by
) values (
  '116d8d4f-0a27-4ea3-8dbd-d292cc1be83d',
  'SlipSurge, refreshed.',
  E'Light or dark. Your call.\nA cleaner workspace, from The Court to The Sideline.\n50 animated avatar styles. Make it yours.',
  E'Change your theme\nOpen your profile menu and choose Light or Dark.\n\nChoose your avatar style\nSettings → Profile → Avatar style → Change style. Pick one, then Save Profile.',
  array['/images/changelog/slipsurge-refreshed-20261121.png'],
  'all', true, null
) on conflict (id) do nothing;

do $verify$
begin
  if not exists (
    select 1 from public.changelog_entries
    where id = '116d8d4f-0a27-4ea3-8dbd-d292cc1be83d'::uuid
      and title = 'SlipSurge, refreshed.'
      and description = E'Light or dark. Your call.\nA cleaner workspace, from The Court to The Sideline.\n50 animated avatar styles. Make it yours.'
      and how_to_use = E'Change your theme\nOpen your profile menu and choose Light or Dark.\n\nChoose your avatar style\nSettings → Profile → Avatar style → Change style. Pick one, then Save Profile.'
      and screenshot_urls = array['/images/changelog/slipsurge-refreshed-20261121.png']
      and audience_tier = 'all' and is_active
  ) then
    raise exception 'Existing announcement does not match the approved release.';
  end if;
end
$verify$;

commit;

select id,title,audience_tier,is_active,created_at,screenshot_urls
from public.changelog_entries
where id='116d8d4f-0a27-4ea3-8dbd-d292cc1be83d'::uuid;
