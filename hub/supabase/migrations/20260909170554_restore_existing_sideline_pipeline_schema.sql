-- Restore the existing NFL matrix API-only access model.
drop policy if exists nfl_matrices_owner on public.nfl_matrices;
revoke all on public.nfl_matrices from anon, authenticated;
-- These unused staging tables were created during this audit before resolving
-- the production branch; the live pipeline uses nfl_pikkit_picks_* instead.
do $$
begin
  if exists (select 1 from public.nfl_public_picks) or exists (select 1 from public.nfl_public_pick_history) then
    raise exception 'Refusing to remove nonempty staging tables';
  end if;
end $$;
drop table public.nfl_public_pick_history;
drop table public.nfl_public_picks;
drop index if exists public.nfl_matrices_owner_idx;
