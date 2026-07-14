// Checks every FanDuel market on the HR Derby page against Baseball Savant's
// real live derby feed and reports which ones have already been decided.
// Most markets are monotonically determinable from swing-by-swing data (a
// count or a max can only go up). Bracket markets (To Make Semifinal, To
// Make the Finals) are also real and verifiable — Savant's feed tags every
// HR with summary.matchup (the bracket pairing index) and
// summary.batterMatchupHrs (that player's HR count within their own
// matchup), confirmed directly against the live feed. Once the derby moves
// past a round (status.currentRound > that round), every matchup in it is
// final, so the higher-batterMatchupHrs player in each pairing is the real,
// confirmed winner — not a guess. Champion/League/MVP/Exact Result/
// Finalists/Double Chance still aren't covered: those resolve off the
// Round 3 (Finals) matchup, and there's no "round after 3" to compare
// against to know Round 3 itself is over.
import type { DerbyPlayer } from '@/components/dugout/HrDerbyTable'
import { PLAYER_MARKETS, TOTAL_MARKETS, FT500_MARKET, PROP_LINES, COMBINE_MARKETS, H2H_MARKETS, FINALISTS, DOUBLE_CHANCE } from './hrDerbyOdds'

export type LiveHr = {
  playerId: number
  playerName: string
  round: number
  hrNumInRound: number | null
  matchup: number | null
  batterMatchupHrs: number | null
  exitVelocity: number | null
  distance: number | null
  launchAngle: number | null
  time: string | null
}

export type LiveStatusLike = { currentRound: number } | null

// players is empty for field-wide markets (totals, 500ft-HR count) that
// aren't tied to any one participant.
export type CashedProp = { key: string; players: string[]; category: string; prop: string; odds: number }

export function fmtCashOdds(o: number) { return o > 0 ? `+${o}` : `${o}` }

// Winner of every fully-decided round+matchup pairing, keyed off the real
// bracket data (not a guess at seeding) — a matchup only resolves here once
// both of its players have at least one recorded HR event in that round; a
// 0-HR round for a competitor (essentially never happens in a real derby
// round) would leave that matchup unresolved rather than risk a wrong call.
// A tied matchup (real derbies settle those with a swing-off) is also left
// unresolved here rather than arbitrarily picking a side.
function matchupWinners(hrs: LiveHr[], round: number): string[] {
  const byMatchup = new Map<number, Map<number, { name: string; max: number }>>()
  for (const h of hrs) {
    if (h.round !== round || h.matchup == null || h.batterMatchupHrs == null) continue
    let m = byMatchup.get(h.matchup)
    if (!m) { m = new Map(); byMatchup.set(h.matchup, m) }
    const cur = m.get(h.playerId) ?? { name: h.playerName, max: 0 }
    cur.max = Math.max(cur.max, h.batterMatchupHrs)
    m.set(h.playerId, cur)
  }
  const winners: string[] = []
  for (const playersInMatchup of byMatchup.values()) {
    const entries = Array.from(playersInMatchup.values())
    if (entries.length !== 2 || entries[0].max === entries[1].max) continue
    winners.push(entries[0].max > entries[1].max ? entries[0].name : entries[1].name)
  }
  return winners
}

// Every player tied for the field lead in a round — 1 name means an
// outright leader, 2+ means a tie (pushes/voids for all of them, no loser
// among the tied group since none of them actually lost to another).
function round1Leaders(round1CountByPlayer: Map<number, number>, players: DerbyPlayer[]): string[] {
  let max = -1
  for (const p of players) max = Math.max(max, round1CountByPlayer.get(p.mlbId) ?? 0)
  if (max <= 0) return []
  return players.filter(p => (round1CountByPlayer.get(p.mlbId) ?? 0) === max).map(p => p.name)
}

export function computeCashedProps(hrs: LiveHr[], players: DerbyPlayer[], status: LiveStatusLike): CashedProp[] {
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
      if (max > pl.line) cashed.push({ key: `pl-${pl.player}-longest`, players: [pl.player], category: 'Prop Line', prop: `Over ${pl.line} ft Longest HR`, odds: pl.overOdds })
    } else if (pl.label.includes('Exit Velocity')) {
      const max = maxEvByPlayer.get(mlbId) ?? 0
      if (max > pl.line) cashed.push({ key: `pl-${pl.player}-ev`, players: [pl.player], category: 'Prop Line', prop: `Over ${pl.line} MPH Exit Velo`, odds: pl.overOdds })
    } else if (pl.label.includes('Total Home Runs')) {
      const cnt = round1CountByPlayer.get(mlbId) ?? 0
      if (cnt > pl.line) cashed.push({ key: `pl-${pl.player}-r1hr`, players: [pl.player], category: 'Prop Line', prop: `Over ${pl.line} Round 1 HRs`, odds: pl.overOdds })
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
        if (cnt >= threshold) cashed.push({ key: `m-r1hr${threshold}-${opt.player}`, players: [opt.player], category: 'Round 1', prop: `${threshold}+ HRs in Round 1`, odds: opt.odds })
      }
    }
    const laserMatch = m.title.match(/^Player to Hit (\d+)\+ Lasers/)
    if (laserMatch) {
      const threshold = parseInt(laserMatch[1])
      for (const opt of m.options) {
        const mlbId = byName.get(opt.player)
        if (mlbId == null) continue
        const cnt = round1LaserCountByPlayer.get(mlbId) ?? 0
        if (cnt >= threshold) cashed.push({ key: `m-laser${threshold}-${opt.player}`, players: [opt.player], category: 'Round 1', prop: `${threshold}+ Lasers (110+ MPH) in Round 1`, odds: opt.odds })
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
      cashed.push({ key: `t-${m.title}`, players: [], category: 'Total', prop: `${m.title.split('—')[0].trim()} — Over ${threshold}`, odds: overOpt.odds })
    }
  }

  // 500+ foot HR count thresholds (field-wide, not tied to one player).
  for (const opt of FT500_MARKET.options) {
    const threshold = parseInt(opt.player)
    if (ft500Count >= threshold) cashed.push({ key: `ft500-${opt.player}`, players: [], category: '500ft HRs', prop: `${opt.player} 500-Foot Home Runs`, odds: opt.odds })
  }

  // Bracket advancement — only once the derby has actually moved past that
  // round, so every matchup in it is truly final.
  const currentRound = status?.currentRound ?? 0
  if (currentRound > 1) {
    const mostHrMarket = PLAYER_MARKETS.find(m => m.title === 'Player to Hit the Most Home Runs in the First Round')
    if (mostHrMarket) {
      const leaders = round1Leaders(round1CountByPlayer, players)
      if (leaders.length === 1) {
        const opt = mostHrMarket.options.find(o => o.player === leaders[0])
        if (opt) cashed.push({ key: `mosthr-r1-${leaders[0]}`, players: [leaders[0]], category: 'Round 1', prop: 'Most HRs in Round 1 (outright)', odds: opt.odds })
      }
    }
    const semiMarket = PLAYER_MARKETS.find(m => m.title === 'To Make Semifinal')
    for (const name of matchupWinners(hrs, 1)) {
      const opt = semiMarket?.options.find(o => o.player === name)
      if (opt) cashed.push({ key: `bracket-semi-${name}`, players: [name], category: 'Bracket', prop: 'Advanced to Semifinal (won Round 1 matchup)', odds: opt.odds })
    }
  }
  if (currentRound > 2) {
    const finalsMarket = PLAYER_MARKETS.find(m => m.title === 'To Make the Finals')
    for (const name of matchupWinners(hrs, 2)) {
      const opt = finalsMarket?.options.find(o => o.player === name)
      if (opt) cashed.push({ key: `bracket-finals-${name}`, players: [name], category: 'Bracket', prop: 'Advanced to the Finals (won Semifinal matchup)', odds: opt.odds })
    }
  }

  // Combine-for-X Round 1 HRs pairs.
  for (const cm of COMBINE_MARKETS) {
    const threshold = parseInt(cm.threshold)
    for (const pair of cm.pairs) {
      const aId = byName.get(pair.a)
      const bId = byName.get(pair.b)
      if (aId == null || bId == null) continue
      const combined = (round1CountByPlayer.get(aId) ?? 0) + (round1CountByPlayer.get(bId) ?? 0)
      if (combined >= threshold) cashed.push({ key: `combine-${cm.threshold}-${pair.a}-${pair.b}`, players: [pair.a, pair.b], category: 'Combine', prop: `Combine ${cm.threshold} Round 1 HRs`, odds: pair.odds })
    }
  }

  return cashed
}

export type MarketOutcome = 'won' | 'lost' | 'void'

// Per-row won/lost/void lookup for every option/pair shown in the odds
// panel itself, not just the top cashed list — so every market on the page
// can highlight green+check, red+x, or (on a genuine tie) yellow+void once
// we actually know the outcome. Keys:
//   pm::<market title>::<player>       PLAYER_MARKETS options
//   tot::<market title>::<Over/Under>  TOTAL_MARKETS options
//   ft500::<threshold>                 FT500_MARKET (won-only, no full-derby-over signal to call a loss)
//   propline::<player>::<label>::over|under
//   h2h::<index>::a|b                  H2H_MARKETS, by its render-order index
//   combine::<threshold>::<a>::<b>
//   finalists::<a>::<b>
//   doublechance::<a>::<b>
// Deliberately no keys for League/MVP/Exact Result/Champion, or the
// whole-derby "Under" side of Total HRs/Highest EV/500ft markets — none of
// those are determinable without a "derby is fully over" signal this feed
// doesn't give us mid-event.
export function computeMarketSettlement(hrs: LiveHr[], players: DerbyPlayer[], status: LiveStatusLike): Map<string, MarketOutcome> {
  const byName = new Map(players.map(p => [p.name, p.mlbId]))
  const settled = new Map<string, MarketOutcome>()

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
  const ft500Count = hrs.filter(h => (h.distance ?? 0) >= 500).length
  const currentRound = status?.currentRound ?? 0
  const round1Final = currentRound > 1
  const round2Final = currentRound > 2
  const round1Winners = round1Final ? new Set(matchupWinners(hrs, 1)) : new Set<string>()
  const round2Winners = round2Final ? new Set(matchupWinners(hrs, 2)) : new Set<string>()

  for (const m of PLAYER_MARKETS) {
    const hrMatch = m.title.match(/^Player to Hit (\d+)\+ Home Runs in the First Round$/)
    if (hrMatch && round1Final) {
      const threshold = parseInt(hrMatch[1])
      for (const opt of m.options) {
        const mlbId = byName.get(opt.player)
        if (mlbId == null) continue
        const cnt = round1CountByPlayer.get(mlbId) ?? 0
        settled.set(`pm::${m.title}::${opt.player}`, cnt >= threshold ? 'won' : 'lost')
      }
    }
    const laserMatch = m.title.match(/^Player to Hit (\d+)\+ Lasers/)
    if (laserMatch && round1Final) {
      const threshold = parseInt(laserMatch[1])
      for (const opt of m.options) {
        const mlbId = byName.get(opt.player)
        if (mlbId == null) continue
        const cnt = round1LaserCountByPlayer.get(mlbId) ?? 0
        settled.set(`pm::${m.title}::${opt.player}`, cnt >= threshold ? 'won' : 'lost')
      }
    }
    if (m.title === 'Player to Hit the Most Home Runs in the First Round' && round1Final) {
      const leaders = round1Leaders(round1CountByPlayer, players)
      for (const opt of m.options) {
        if (leaders.length > 1 && leaders.includes(opt.player)) settled.set(`pm::${m.title}::${opt.player}`, 'void')
        else settled.set(`pm::${m.title}::${opt.player}`, leaders[0] === opt.player ? 'won' : 'lost')
      }
    }
    if (m.title === 'To Make Semifinal' && round1Final) {
      for (const opt of m.options) settled.set(`pm::${m.title}::${opt.player}`, round1Winners.has(opt.player) ? 'won' : 'lost')
    }
    if (m.title === 'To Make the Finals') {
      for (const opt of m.options) {
        if (round2Final) settled.set(`pm::${m.title}::${opt.player}`, round2Winners.has(opt.player) ? 'won' : 'lost')
        else if (round1Final && !round1Winners.has(opt.player)) settled.set(`pm::${m.title}::${opt.player}`, 'lost')
      }
    }
  }

  for (const m of TOTAL_MARKETS) {
    const thMatch = m.title.match(/—\s*([\d.]+)\s*$/)
    if (!thMatch) continue
    const threshold = parseFloat(thMatch[1])
    if (m.title.startsWith('Round 1 Total Home Runs') && round1Final) {
      for (const opt of m.options) {
        const isOver = /^Over/i.test(opt.player)
        const cashed = isOver ? round1Total > threshold : round1Total < threshold
        settled.set(`tot::${m.title}::${opt.player}`, cashed ? 'won' : 'lost')
      }
    } else if (m.title.startsWith('Total Home Runs Hit By All Players') || m.title.startsWith('Highest Exit Velocity')) {
      const actual = m.title.startsWith('Total Home Runs Hit By All Players') ? hrs.length : hrs.reduce((mx, h) => Math.max(mx, h.exitVelocity ?? 0), 0)
      const overOpt = m.options.find(o => /^Over/i.test(o.player))
      const underOpt = m.options.find(o => /^Under/i.test(o.player))
      if (actual > threshold) {
        if (overOpt) settled.set(`tot::${m.title}::${overOpt.player}`, 'won')
        if (underOpt) settled.set(`tot::${m.title}::${underOpt.player}`, 'lost')
      }
    }
  }

  for (const opt of FT500_MARKET.options) {
    const threshold = parseInt(opt.player)
    if (ft500Count >= threshold) settled.set(`ft500::${opt.player}`, 'won')
  }

  for (const pl of PROP_LINES) {
    const mlbId = byName.get(pl.player)
    if (mlbId == null) continue
    if (pl.label.includes('Longest')) {
      const max = maxDistByPlayer.get(mlbId) ?? 0
      if (max > pl.line) { settled.set(`propline::${pl.player}::${pl.label}::over`, 'won'); settled.set(`propline::${pl.player}::${pl.label}::under`, 'lost') }
    } else if (pl.label.includes('Exit Velocity')) {
      const max = maxEvByPlayer.get(mlbId) ?? 0
      if (max > pl.line) { settled.set(`propline::${pl.player}::${pl.label}::over`, 'won'); settled.set(`propline::${pl.player}::${pl.label}::under`, 'lost') }
    } else if (pl.label.includes('Total Home Runs') && round1Final) {
      const cnt = round1CountByPlayer.get(mlbId) ?? 0
      const over = cnt > pl.line
      settled.set(`propline::${pl.player}::${pl.label}::over`, over ? 'won' : 'lost')
      settled.set(`propline::${pl.player}::${pl.label}::under`, over ? 'lost' : 'won')
    }
  }

  if (round1Final) {
    H2H_MARKETS.forEach((h, i) => {
      const aId = byName.get(h.a)
      const bId = byName.get(h.b)
      if (aId == null || bId == null) return
      const aCnt = round1CountByPlayer.get(aId) ?? 0
      const bCnt = round1CountByPlayer.get(bId) ?? 0
      if (aCnt === bCnt) { settled.set(`h2h::${i}::a`, 'void'); settled.set(`h2h::${i}::b`, 'void'); return }
      settled.set(`h2h::${i}::a`, aCnt > bCnt ? 'won' : 'lost')
      settled.set(`h2h::${i}::b`, bCnt > aCnt ? 'won' : 'lost')
    })

    for (const cm of COMBINE_MARKETS) {
      const threshold = parseInt(cm.threshold)
      for (const pair of cm.pairs) {
        const aId = byName.get(pair.a)
        const bId = byName.get(pair.b)
        if (aId == null || bId == null) continue
        const combined = (round1CountByPlayer.get(aId) ?? 0) + (round1CountByPlayer.get(bId) ?? 0)
        settled.set(`combine::${cm.threshold}::${pair.a}::${pair.b}`, combined >= threshold ? 'won' : 'lost')
      }
    }

    for (const pair of DOUBLE_CHANCE) {
      const hit = round1Winners.has(pair.a) || round1Winners.has(pair.b)
      settled.set(`doublechance::${pair.a}::${pair.b}`, hit ? 'won' : 'lost')
    }
  }

  if (round2Final && round2Winners.size === 2) {
    for (const pair of FINALISTS) {
      const isMatch = round2Winners.has(pair.a) && round2Winners.has(pair.b)
      settled.set(`finalists::${pair.a}::${pair.b}`, isMatch ? 'won' : 'lost')
    }
  }

  return settled
}
