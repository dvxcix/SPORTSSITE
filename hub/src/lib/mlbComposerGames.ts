import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysMatchups, isPregame } from '@slipsurge/core/mlbSchedule'
import { normName, resolveNameEntry, resolvePlayerIdentity } from '@slipsurge/core/nameNorm'
import { mlbCaptureOpen } from '@/lib/mlbCaptureWindow'

/** The existing MLB composer slate, lineups and book capture sources. */
export async function loadMlbComposerGames(date: string, native = false) {
  // getTodaysMatchups' status is MLB's granular detailedState ("Pre-Game",
  // "Warmup", "In Progress", ...) — PickComposer's GamePicker checks the
  // coarse `status !== 'Preview'` (the same abstractGameState enum
  // dugout/data returns) to grey out a game that's already started.
  // Collapsing to that same 3-value enum here keeps GamePicker's existing
  // check correct without touching that component.
  const schedule = await getTodaysMatchups(date)
  const rawGames = (native ? schedule.filter(game => mlbCaptureOpen(game)) : schedule).map(g => ({
    ...g,
    status: isPregame(g.status) ? 'Preview' : /final/i.test(g.status) ? 'Final' : 'Live',
  }))
  if (!rawGames.length) return { games: [], available: false }

  let admin: ReturnType<typeof createAdminClient> | null = null
  try { admin = createAdminClient() } catch { admin = null }
  if (!admin) return { games: rawGames.map(g => ({ ...g, homeLineup: g.homeLineup.map(p => ({ ...p, props: null })), awayLineup: g.awayLineup.map(p => ({ ...p, props: null })) })), available: false }

  const gamePks = rawGames.map(g => String(g.gamePk))

  // A single `.range(0, 19999)` here was, despite the huge upper bound,
  // still only ever returning this project's PostgREST-capped 1000 rows —
  // same "generous range, but not actually looped" bug confirmed live
  // elsewhere (pitchLogFetch.ts/dugoutMatchupEdgePrecompute.ts/odds-terminal).
  // Paginated defensively; pregame_odds_snapshots stays as-is since it's
  // genuinely bounded by gamePks.length (one row per game, ~15/day).
  const PAGE = 1000
  async function fetchAllGapOdds(table: string, cols: string) {
    const rows: any[] = []
    for (let offset = 0; ; offset += PAGE) {
      const { data } = await admin!.from(table).select(cols).eq('game_date', date).range(offset, offset + PAGE - 1)
      if (!data?.length) break
      rows.push(...data)
      if (data.length < PAGE) break
    }
    return rows
  }
  const [{ data: snapRows }, fdRows, mgmRows] = await Promise.all([
    admin.from('pregame_odds_snapshots').select('game_pk, prop_map').in('game_pk', gamePks),
    fetchAllGapOdds('fanduel_gap_odds', 'game_key, name_norm, fhr_fd, sa_fd, hr2_fd, sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb_fd, tb3_fd, tb4_fd, tb5_fd, hrr_fd, laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hr_ml_fd'),
    fetchAllGapOdds('mgm_gap_odds', 'game_key, name_norm, sa_mgm, hr2_mgm'),
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
    const starters = native ? [[g.homePitcher, g.homeAbbr], [g.awayPitcher, g.awayAbbr]] as const : []
    const pitchers = starters.flatMap(([pitcher, team]) => pitcher ? [{
      mlb_id: pitcher.id, name: pitcher.name, team, position: 'P', bats: '',
    }] : [])
    const identityCandidates = [...g.homeLineup, ...g.awayLineup, ...pitchers].map(player => ({
      mlbId: player.mlb_id,
      name: player.name,
      team: player.team,
    }))
    const bdlByMlbId: Record<number, any> = {}
    for (const [sourceId, entry] of Object.entries(propMap)) {
      if (entry?.name) bdlByName[normName(entry.name)] = entry
      if (!entry?.name) continue
      const identity = resolvePlayerIdentity(identityCandidates, entry.name, {
        provider: 'bdl', sourceId: entry.source_player_id ?? sourceId, sourceTeam: entry.source_team,
      })
      if (identity) bdlByMlbId[identity.mlbId] = entry
    }
    const entryForSourceName = (sourceName: string) => {
      const identity = resolvePlayerIdentity(identityCandidates, sourceName)
      if (identity) {
        const entry = bdlByMlbId[identity.mlbId] ?? (native ? null : resolveNameEntry(bdlByName, normName(identity.name))) ?? { name: identity.name }
        bdlByMlbId[identity.mlbId] = entry
        bdlByName[normName(sourceName)] = entry
        return entry
      }
      return resolveNameEntry(bdlByName, normName(sourceName)) ?? (bdlByName[normName(sourceName)] = { name: sourceName })
    }

    const fdByName = fdByGameKey[g.gameKey] ?? {}
    for (const [nn, gap] of Object.entries(fdByName)) {
      const entry = entryForSourceName(nn)
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
      if (gp.hrr_fd  != null && e.hrr?.fanduel     == null) {
        e.hrr = { ...e.hrr, fanduel: gp.hrr_fd }
        if (native) e.hrr_line = { ...e.hrr_line, fanduel: 0.5 } // The import section matches exactly 1+.
      }
      if (gp.laser105_fd != null) e.laser105 = { ...e.laser105, fanduel: gp.laser105_fd }
      if (gp.laser110_fd != null) e.laser110 = { ...e.laser110, fanduel: gp.laser110_fd }
      if (gp.moonshot_fd != null) e.moonshot = { ...e.moonshot, fanduel: gp.moonshot_fd }
      if (gp.pa1_fd       != null) e.pa1      = { ...e.pa1,      fanduel: gp.pa1_fd }
      if (gp.hr_ml_fd     != null) e.hrMl     = { ...e.hrMl,     fanduel: gp.hr_ml_fd }
    }

    const mgmByName = mgmByGameKey[g.gameKey] ?? {}
    for (const [nn, mgm] of Object.entries(mgmByName)) {
      const entry = entryForSourceName(nn)
      const e = entry as any, mg = mgm as any
      if (mg.sa_mgm  != null && e.sa?.betmgm  == null) e.sa  = { ...e.sa,  betmgm: mg.sa_mgm }
      if (mg.hr2_mgm != null && e.hr2?.betmgm == null) e.hr2 = { ...e.hr2, betmgm: mg.hr2_mgm }
    }

    const withProps = <Player extends { mlb_id: number; name: string }>(players: Player[]) =>
      players.map(p => ({ ...p, name_norm: normName(p.name), props: bdlByMlbId[p.mlb_id] ?? (native ? null : resolveNameEntry(bdlByName, normName(p.name))) ?? null }))

    return { ...g, homeLineup: withProps(g.homeLineup), awayLineup: withProps(g.awayLineup),
      ...(native ? { pitchers: withProps(pitchers) } : {}),
    }
  })

  return { games: merged, available: true }
}
