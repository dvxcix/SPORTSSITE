import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysMatchups, isPregame } from '@/lib/mlbSchedule'
import { normName, resolveNameEntry } from '@/lib/nameNorm'

export const revalidate = 0

// PickComposer.tsx used to fetch /api/dugout/data for its "today's games"
// dropdown — that route is (correctly) requireTier('ultimate') for the
// heavy Dugout/Batter Cost/The Public/Pitcher Report analytics payload it
// also returns, but posting a pick from the feed has never been tier-gated
// anywhere else (FeedComposer renders PickComposer unconditionally,
// POST /api/posts/pick has no tier check) — so an Advanced-tier member
// hit a silent 403 on every load, which PickComposer's .catch(() => {})
// rendered identically to "no real games today". This route gives the
// composer just what it needs (today's games/lineups + real book prices),
// open to any signed-in user, without inheriting the Ultimate gate.
//
// Reuses getTodaysMatchups (the same lean schedule/lineup fetcher the
// player page's Matchup Explorer uses) instead of dugout/data's own inline
// schedule fetch, then layers in the exact same BDL-snapshot + FanDuel/MGM
// gap-odds merge dugout/data/route.ts uses — copied rather than imported
// from there, matching this codebase's existing pattern (mlbSchedule.ts's
// own header comment) of a deliberately separate, stripped-down file
// instead of threading a "for composer, skip the heavy stuff" flag through
// an already-complex shared route.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // getTodaysMatchups' status is MLB's granular detailedState ("Pre-Game",
  // "Warmup", "In Progress", ...) — PickComposer's GamePicker checks the
  // coarse `status !== 'Preview'` (the same abstractGameState enum
  // dugout/data returns) to grey out a game that's already started.
  // Collapsing to that same 3-value enum here keeps GamePicker's existing
  // check correct without touching that component.
  const rawGames = (await getTodaysMatchups(date)).map(g => ({
    ...g,
    status: isPregame(g.status) ? 'Preview' : /final/i.test(g.status) ? 'Final' : 'Live',
  }))
  if (!rawGames.length) return NextResponse.json({ date, games: [] })

  let admin: ReturnType<typeof createAdminClient> | null = null
  try { admin = createAdminClient() } catch { admin = null }
  if (!admin) return NextResponse.json({ date, games: rawGames.map(g => ({ ...g, homeLineup: g.homeLineup.map(p => ({ ...p, props: null })), awayLineup: g.awayLineup.map(p => ({ ...p, props: null })) })) })

  const gamePks = rawGames.map(g => String(g.gamePk))

  const [{ data: snapRows }, { data: fdRows }, { data: mgmRows }] = await Promise.all([
    admin.from('pregame_odds_snapshots').select('game_pk, prop_map').in('game_pk', gamePks),
    admin.from('fanduel_gap_odds')
      .select('game_key, name_norm, fhr_fd, sa_fd, hr2_fd, sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb_fd, tb3_fd, tb4_fd, tb5_fd, hrr_fd, laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hr_ml_fd')
      .eq('game_date', date).range(0, 19999),
    admin.from('mgm_gap_odds').select('game_key, name_norm, sa_mgm, hr2_mgm').eq('game_date', date).range(0, 19999),
  ])

  const propMapByGamePk = new Map<string, Record<string, any>>()
  for (const row of snapRows ?? []) propMapByGamePk.set(row.game_pk, row.prop_map ?? {})
  const fdByGameKey: Record<string, Record<string, any>> = {}
  for (const r of fdRows ?? []) (fdByGameKey[r.game_key] ??= {})[r.name_norm] = r
  const mgmByGameKey: Record<string, Record<string, any>> = {}
  for (const r of mgmRows ?? []) (mgmByGameKey[r.game_key] ??= {})[r.name_norm] = r

  const merged = rawGames.map(g => {
    const propMap = propMapByGamePk.get(String(g.gamePk)) ?? {}
    const bdlByName: Record<string, any> = {}
    for (const entry of Object.values(propMap)) {
      if (entry?.name) bdlByName[normName(entry.name)] = entry
    }

    const fdByName = fdByGameKey[g.gameKey] ?? {}
    for (const [nn, gap] of Object.entries(fdByName)) {
      const entry = resolveNameEntry(bdlByName, nn) ?? (bdlByName[nn] = { name: (gap as any).player_name ?? nn })
      const e = entry as any, gp = gap as any
      if (gp.fhr_fd      != null) e.fhr      = { ...e.fhr,      fanduel: gp.fhr_fd }
      if (gp.sa_fd  != null && e.sa?.fanduel  == null) e.sa  = { ...e.sa,  fanduel: gp.sa_fd }
      if (gp.hr2_fd != null && e.hr2?.fanduel == null) e.hr2 = { ...e.hr2, fanduel: gp.hr2_fd }
      if (gp.sng_fd  != null && e.singles?.fanduel == null) e.singles = { ...e.singles, fanduel: gp.sng_fd }
      if (gp.dbl_fd  != null && e.doubles?.fanduel == null) e.doubles = { ...e.doubles, fanduel: gp.dbl_fd }
      if (gp.tri_fd  != null && e.triples?.fanduel == null) e.triples = { ...e.triples, fanduel: gp.tri_fd }
      if (gp.rbi_fd  != null && e.rbi?.fanduel     == null) e.rbi     = { ...e.rbi,     fanduel: gp.rbi_fd }
      if (gp.rbi2_fd != null && e.rbi2?.fanduel    == null) e.rbi2    = { ...e.rbi2,    fanduel: gp.rbi2_fd }
      if (gp.rbi3_fd != null && e.rbi3?.fanduel    == null) e.rbi3    = { ...e.rbi3,    fanduel: gp.rbi3_fd }
      if (gp.tb_fd   != null && e.tb?.fanduel      == null) e.tb      = { ...e.tb,      fanduel: gp.tb_fd }
      if (gp.tb3_fd  != null && e.tb3?.fanduel     == null) e.tb3     = { ...e.tb3,     fanduel: gp.tb3_fd }
      if (gp.tb4_fd  != null && e.tb4?.fanduel     == null) e.tb4     = { ...e.tb4,     fanduel: gp.tb4_fd }
      if (gp.tb5_fd  != null && e.tb5?.fanduel     == null) e.tb5     = { ...e.tb5,     fanduel: gp.tb5_fd }
      if (gp.hrr_fd  != null && e.hrr?.fanduel     == null) e.hrr     = { ...e.hrr,     fanduel: gp.hrr_fd }
      if (gp.laser105_fd != null) e.laser105 = { ...e.laser105, fanduel: gp.laser105_fd }
      if (gp.laser110_fd != null) e.laser110 = { ...e.laser110, fanduel: gp.laser110_fd }
      if (gp.moonshot_fd != null) e.moonshot = { ...e.moonshot, fanduel: gp.moonshot_fd }
      if (gp.pa1_fd       != null) e.pa1      = { ...e.pa1,      fanduel: gp.pa1_fd }
      if (gp.hr_ml_fd     != null) e.hrMl     = { ...e.hrMl,     fanduel: gp.hr_ml_fd }
    }

    const mgmByName = mgmByGameKey[g.gameKey] ?? {}
    for (const [nn, mgm] of Object.entries(mgmByName)) {
      const entry = resolveNameEntry(bdlByName, nn) ?? (bdlByName[nn] = { name: (mgm as any).player_name ?? nn })
      const e = entry as any, mg = mgm as any
      if (mg.sa_mgm  != null && e.sa?.betmgm  == null) e.sa  = { ...e.sa,  betmgm: mg.sa_mgm }
      if (mg.hr2_mgm != null && e.hr2?.betmgm == null) e.hr2 = { ...e.hr2, betmgm: mg.hr2_mgm }
    }

    const withProps = (players: typeof g.homeLineup) =>
      players.map(p => ({ ...p, name_norm: normName(p.name), props: resolveNameEntry(bdlByName, normName(p.name)) ?? null }))

    return { ...g, homeLineup: withProps(g.homeLineup), awayLineup: withProps(g.awayLineup) }
  })

  return NextResponse.json(
    { date, games: merged },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  )
}
