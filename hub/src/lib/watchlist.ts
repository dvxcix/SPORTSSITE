import { createClient } from '@/lib/supabase/client'
import { combineOdds, calcPayout } from '@/lib/parlayCalc'

// ─── Prop metadata ─────────────────────────────────────────────────────────
// Maps a raw BDL propMap key (or synthetic key) to what shows on the
// consumer side (post captions, pick cards, watchlist) + a pick_type used
// when posting to the picks/feed table. `label` is deliberately the market's
// literal FanDuel section title, not our own shorthand for it — someone
// reading a pick needs to be able to go find that exact market on FanDuel
// itself, and an internal nickname/code (e.g. "pa1") doesn't exist there.
// Titles below are the real scraped section names FanDuel uses (see
// SECTION_MAP in api/admin/fanduel-import/route.ts, matched there via
// exact-anchored regex against FanDuel's own page text) or, where noted,
// confirmed directly.
export const PROP_META: Record<string, { label: string; pickType: string }> = {
  fhr:                 { label: 'To Hit First Home Run',                        pickType: 'first_hr' },
  sa:                  { label: 'To Hit a Home Run',                           pickType: 'anytime_hr' },
  hr2:                 { label: 'To Hit 2+ Home Runs',                          pickType: 'hr_2plus' },
  // Confirmed directly (not in SECTION_MAP's regex-matched set, which only
  // needs "first plate appearance"/"home run"+"moneyline parlay" to match —
  // these are the real full titles).
  pa1:                 { label: 'To Hit a Home Run in First Plate Appearance', pickType: 'first_pa_hr' },
  hrMl:                { label: 'Home Run / Moneyline Parlay',                 pickType: 'hr_moneyline_parlay' },
  singles:             { label: 'To Hit a Single',                             pickType: 'single' },
  doubles:             { label: 'To Hit a Double',                             pickType: 'double' },
  triples:             { label: 'To Hit a Triple',                             pickType: 'triple' },
  rbi:                 { label: 'To Record an RBI',                            pickType: 'rbi' },
  rbi2:                { label: 'To Record 2+ RBIs',                           pickType: 'rbi_2plus' },
  rbi3:                { label: 'To Record 3+ RBIs',                           pickType: 'rbi_3plus' },
  tb4:                 { label: 'To Record 4+ Total Bases',                    pickType: 'total_bases_4plus' },
  tb5:                 { label: 'To Record 5+ Total Bases',                    pickType: 'total_bases_5plus' },
  hrr:                 { label: 'Player to Record 1+ Hits + Runs + RBIs',      pickType: 'hits_runs_rbis' },
  // Everything below isn't in SECTION_MAP (BDL carries these directly, not
  // scraped from a FanDuel page section), so the exact FanDuel title hasn't
  // been confirmed the same way as the ones above — flagged for a follow-up
  // pass once that wording's been checked against FanDuel directly.
  hits:                { label: '1+ Hits',               pickType: 'hits' },
  tb:                  { label: '1.5+ Total Bases',      pickType: 'total_bases' },
  runs:                { label: '1+ Run Scored',         pickType: 'run_scored' },
  stolen_bases:        { label: '1+ Stolen Base',        pickType: 'stolen_base' },
  strikeouts:          { label: '1+ Strikeout (batter)', pickType: 'batter_strikeout' },
  pitcher_strikeouts:  { label: 'Pitcher Strikeouts',    pickType: 'pitcher_strikeouts' },
  laser105:            { label: 'Laser (105+ MPH Home Run)', pickType: 'laser_105' },
  laser110:            { label: 'Laser (110+ MPH Home Run)', pickType: 'laser_110' },
  moonshot:            { label: 'Moonshot Home Run',     pickType: 'moonshot' },
}

export type WatchlistItem = {
  id: string
  user_id: string
  sport: string
  game_pk: string | null
  game_date: string | null
  mlb_id: number | null
  player_name: string
  team: string | null
  position: string | null
  bats: string | null
  headshot_url: string | null
  prop_key: string
  prop_label: string
  line: string | null
  book: string | null
  odds: number | null
  odds_by_book: Record<string, number>
  notes: string | null
  status: 'pending' | 'posted' | 'archived'
  posted_pick_id: string | null
  created_at: string
  updated_at: string
}

export type NewWatchlistItem = {
  sport?: string
  game_pk?: string | null
  game_date?: string | null
  mlb_id?: number | null
  player_name: string
  team?: string | null
  position?: string | null
  bats?: string | null
  headshot_url?: string | null
  prop_key: string
  prop_label: string
  line?: string | null
  book?: string | null
  odds?: number | null
  odds_by_book?: Record<string, number>
  notes?: string | null
}

export async function fetchWatchlist(userId: string): Promise<WatchlistItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('watchlist_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function addWatchlistItem(userId: string, item: NewWatchlistItem): Promise<WatchlistItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('watchlist_items')
    .insert({ user_id: userId, ...item })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function removeWatchlistItem(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('watchlist_items').delete().eq('id', id)
  if (error) throw error
}

// Post one or more watchlist items into the picks table + a single feed
// post, then mark them posted. legs.length === 1 -> a straight bet.
// legs.length > 1 -> a parlay, which requires every leg to share a book —
// sportsbooks don't let you parlay legs across different books, since each
// book only pays out its own combined price.
export async function postBetToFeed(
  userId: string,
  legs: WatchlistItem[],
  opts: { content?: string; isPremium?: boolean; visibility?: string; wagerAmount?: number | null } = {}
): Promise<{ postId: string; pickIds: string[] }> {
  if (legs.length === 0) throw new Error('No legs to post')

  const isParlay = legs.length > 1
  const books = new Set(legs.map(l => l.book).filter(Boolean))
  if (isParlay && books.size !== 1) {
    throw new Error('All parlay legs must be from the same sportsbook')
  }
  const book = legs[0].book ?? null

  const oddsList = legs.map(l => l.odds)
  if (oddsList.some(o => o == null)) throw new Error('Every leg needs odds to post')
  const combined = isParlay ? combineOdds(oddsList as number[]) : (oddsList[0] as number)

  const wager = opts.wagerAmount ?? null
  const payout = wager != null && wager > 0 ? calcPayout(wager, combined).payout : null

  const supabase = createClient()

  // Sportsbook name is deliberately left out of this auto-generated caption
  // — it's already shown as a real BookLogo on the structured pick card
  // rendered right below the content text (PostCardClient), so spelling it
  // out again in plain text here was both redundant and the one place that
  // ended up naming the book everywhere the caption gets echoed (Explore,
  // notifications, link previews) instead of showing it as a logo.
  const content = opts.content?.trim() || (isParlay
    ? `${legs.length}-Leg Parlay · ${combined > 0 ? `+${combined}` : combined}`
    : `${legs[0].player_name} — ${legs[0].prop_label}${legs[0].odds != null ? ` ${legs[0].odds! > 0 ? '+' : ''}${legs[0].odds}` : ''}`)

  const legsSummary = legs.map(l => ({
    player_name: l.player_name,
    team: l.team,
    mlb_id: l.mlb_id,
    headshot_url: l.headshot_url,
    prop_key: l.prop_key,
    prop_label: l.prop_label,
    line: l.line,
    odds: l.odds,
    result: 'pending',
  }))

  const { data: post, error: postErr } = await supabase
    .from('posts')
    .insert({
      author_id: userId,
      content,
      post_type: isParlay ? 'parlay' : 'pick',
      sport: legs[0].sport,
      game_pk: isParlay ? null : legs[0].game_pk,
      is_premium: !!opts.isPremium,
      visibility: opts.visibility ?? 'public',
      book,
      combined_odds: combined,
      wager_amount: wager,
      potential_payout: payout,
      pick_data: isParlay
        ? { legs: legsSummary, book, combined_odds: combined, wager_amount: wager, potential_payout: payout, result: 'pending' }
        : { ...legsSummary[0], book, odds_by_book: legs[0].odds_by_book, wager_amount: wager, potential_payout: payout },
    })
    .select('id')
    .single()
  if (postErr) throw postErr

  const pickRows = legs.map(l => ({
    user_id: userId,
    post_id: post.id,
    sport: l.sport,
    game_pk: l.game_pk,
    game_date: l.game_date,
    mlb_id: l.mlb_id,
    pick_type: PROP_META[l.prop_key]?.pickType ?? l.prop_key,
    team: l.team,
    player_name: l.player_name,
    line: l.line,
    odds: l.odds,
    book: l.book,
    result: 'pending',
  }))
  const { data: picks, error: pickErr } = await supabase.from('picks').insert(pickRows).select('id')
  if (pickErr) throw pickErr

  // The post + picks rows are already live at this point — a failure here
  // only means a watchlist item's own status badge won't flip to "posted"
  // (it stays actionable/visible in the watchlist instead), not that the
  // actual post silently didn't happen. Logged rather than thrown so one
  // bad update doesn't roll back an already-successful post.
  const nowIso = new Date().toISOString()
  const updateResults = await Promise.all(legs.map((l, i) =>
    supabase.from('watchlist_items')
      .update({ status: 'posted', posted_pick_id: picks![i].id, updated_at: nowIso })
      .eq('id', l.id)
  ))
  for (const { error: updateErr } of updateResults) {
    if (updateErr) console.error('[postBetToFeed] failed to mark watchlist item as posted', updateErr)
  }

  return { postId: post.id, pickIds: (picks ?? []).map((p: any) => p.id) }
}

// Legacy single-item wrapper — kept for any existing callers.
export async function postWatchlistItemToFeed(
  userId: string,
  item: WatchlistItem,
  opts: { content?: string; isPremium?: boolean; visibility?: string } = {}
): Promise<{ postId: string; pickId: string }> {
  const { postId, pickIds } = await postBetToFeed(userId, [item], opts)
  return { postId, pickId: pickIds[0] }
}
