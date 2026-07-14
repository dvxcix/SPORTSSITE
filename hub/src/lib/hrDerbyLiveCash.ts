// Checks every FanDuel market on the HR Derby page against Baseball Savant's
// real live derby feed and reports which ones have already been decided.
// Only markets that are monotonically determinable from swing-by-swing data
// (a count or a max can only go up) are covered — bracket/advancement
// markets (Champion, Semis, Finals, League, MVP, Exact Result, Finalists,
// Double Chance) depend on real elimination rules this feed doesn't expose
// cleanly, so guessing at those would risk flagging a market "cashed" when
// it isn't. Left out on purpose rather than shipped wrong.
import type { DerbyPlayer } from '@/components/dugout/HrDerbyTable'
import { PLAYER_MARKETS, TOTAL_MARKETS, FT500_MARKET, PROP_LINES, COMBINE_MARKETS } from './hrDerbyOdds'

export type LiveHr = {
  playerId: number
  playerName: string
  round: number
  hrNumInRound: number | null
  exitVelocity: number | null
  distance: number | null
  launchAngle: number | null
  time: string | null
}

export type CashedProp = { key: string; label: string; odds: number; category: string }

function fmtOdds(o: number) { return o > 0 ? `+${o}` : `${o}` }

export function computeCashedProps(hrs: LiveHr[], players: DerbyPlayer[]): CashedProp[] {
  const byName = new Map(players.map(p => [p.name, p.mlbId]))
  const cashed: CashedProp[] = []

  const round1 = hrs.filter(h => h.round === 1)
  const round1CountByPlayer = new Map<number, number>()
  const round1LaserCountByPlayer = new Map<number, number>()
  const maxDistByPlayer = new Map<number, number>()
  const maxEvByPlayer = new Map<number, number>()

  for (const h of hrs) {
    if (h.round === 1) {
      round1CountByPlayer.set(h.playerId, (round1CountByPlayer.get(h.playerId) ?? 0) + 1)
      if ((h.exitVelocity ?? 0) >= 110) round1LaserCountByPlayer.set(h.playerId, (round1LaserCountByPlayer.get(h.playerId) ?? 0) + 1)
    }
    if (h.distance != null) maxDistByPlayer.set(h.playerId, Math.max(maxDistByPlayer.get(h.playerId) ?? 0, h.distance))
    if (h.exitVelocity != null) maxEvByPlayer.set(h.playerId, Math.max(maxEvByPlayer.get(h.playerId) ?? 0, h.exitVelocity))
  }

  const round1Total = round1.length
  const seasonTotal = hrs.length
  const ft500Count = hrs.filter(h => (h.distance ?? 0) >= 500).length
  const maxEvAll = hrs.reduce((m, h) => Math.max(m, h.exitVelocity ?? 0), 0)

  // Player prop O/U lines — only "Over" is safely determinable live (Under
  // needs the player's turn to be fully finished, which this feed can't
  // confirm cleanly).
  for (const pl of PROP_LINES) {
    const mlbId = byName.get(pl.player)
    if (mlbId == null) continue
    if (pl.label.includes('Longest')) {
      const max = maxDistByPlayer.get(mlbId) ?? 0
      if (max > pl.line) cashed.push({ key: `pl-${pl.player}-longest`, label: `${pl.player} Over ${pl.line} ft Longest HR`, odds: pl.overOdds, category: 'Prop Line' })
    } else if (pl.label.includes('Exit Velocity')) {
      const max = maxEvByPlayer.get(mlbId) ?? 0
      if (max > pl.line) cashed.push({ key: `pl-${pl.player}-ev`, label: `${pl.player} Over ${pl.line} MPH Exit Velo`, odds: pl.overOdds, category: 'Prop Line' })
    } else if (pl.label.includes('Total Home Runs')) {
      const cnt = round1CountByPlayer.get(mlbId) ?? 0
      if (cnt > pl.line) cashed.push({ key: `pl-${pl.player}-r1hr`, label: `${pl.player} Over ${pl.line} Round 1 HRs`, odds: pl.overOdds, category: 'Prop Line' })
    }
  }

  // Round 1 HR-count and Laser-count thresholds, parsed straight off the
  // market titles already shown on the page.
  for (const m of PLAYER_MARKETS) {
    const hrMatch = m.title.match(/^Player to Hit (\d+)\+ Home Runs in the First Round$/)
    if (hrMatch) {
      const threshold = parseInt(hrMatch[1])
      for (const opt of m.options) {
        const mlbId = byName.get(opt.player)
        if (mlbId == null) continue
        const cnt = round1CountByPlayer.get(mlbId) ?? 0
        if (cnt >= threshold) cashed.push({ key: `m-r1hr${threshold}-${opt.player}`, label: `${opt.player} — ${threshold}+ HRs in Round 1`, odds: opt.odds, category: 'Round 1' })
      }
    }
    const laserMatch = m.title.match(/^Player to Hit (\d+)\+ Lasers/)
    if (laserMatch) {
      const threshold = parseInt(laserMatch[1])
      for (const opt of m.options) {
        const mlbId = byName.get(opt.player)
        if (mlbId == null) continue
        const cnt = round1LaserCountByPlayer.get(mlbId) ?? 0
        if (cnt >= threshold) cashed.push({ key: `m-laser${threshold}-${opt.player}`, label: `${opt.player} — ${threshold}+ Lasers (110+ MPH) in Round 1`, odds: opt.odds, category: 'Round 1' })
      }
    }
  }

  // Field totals — round 1 total HRs, season total HRs, highest EV of any
  // player. Threshold is the number after the em-dash in the title.
  for (const m of TOTAL_MARKETS) {
    const thMatch = m.title.match(/—\s*([\d.]+)\s*$/)
    if (!thMatch) continue
    const threshold = parseFloat(thMatch[1])
    const overOpt = m.options.find(o => /^Over/i.test(o.player))
    if (!overOpt) continue
    let actual: number | null = null
    if (m.title.startsWith('Round 1 Total Home Runs')) actual = round1Total
    else if (m.title.startsWith('Total Home Runs Hit By All Players')) actual = seasonTotal
    else if (m.title.startsWith('Highest Exit Velocity')) actual = maxEvAll
    if (actual !== null && actual > threshold) {
      cashed.push({ key: `t-${m.title}`, label: `${m.title.split('—')[0].trim()} — Over ${threshold}`, odds: overOpt.odds, category: 'Total' })
    }
  }

  // 500+ foot HR count thresholds.
  for (const opt of FT500_MARKET.options) {
    const threshold = parseInt(opt.player)
    if (ft500Count >= threshold) cashed.push({ key: `ft500-${opt.player}`, label: `${opt.player} 500-Foot Home Runs`, odds: opt.odds, category: '500ft HRs' })
  }

  // Combine-for-X Round 1 HRs pairs.
  for (const cm of COMBINE_MARKETS) {
    const threshold = parseInt(cm.threshold)
    for (const pair of cm.pairs) {
      const aId = byName.get(pair.a)
      const bId = byName.get(pair.b)
      if (aId == null || bId == null) continue
      const combined = (round1CountByPlayer.get(aId) ?? 0) + (round1CountByPlayer.get(bId) ?? 0)
      if (combined >= threshold) cashed.push({ key: `combine-${cm.threshold}-${pair.a}-${pair.b}`, label: `${pair.a} & ${pair.b} — Combine ${cm.threshold} Round 1 HRs`, odds: pair.odds, category: 'Combine' })
    }
  }

  return cashed
}

export { fmtOdds as fmtCashOdds }
