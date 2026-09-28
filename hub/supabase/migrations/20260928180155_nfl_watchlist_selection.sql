-- Nullable for existing/MLB rows. Existing owner-only RLS remains unchanged.
ALTER TABLE public.watchlist_items ADD COLUMN IF NOT EXISTS nfl_selection jsonb;
COMMENT ON COLUMN public.watchlist_items.nfl_selection IS 'Exact NFL player, prop type, threshold and side; revalidated against current board when posting.';
