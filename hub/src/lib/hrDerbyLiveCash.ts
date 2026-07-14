// Checks every FanDuel market on the HR Derby page against Baseball Savant's
// real live derby feed and reports which ones have already been decided.
// Most markets are monotonically determinable from swing-by-swing data (a
// count or a max can only go up). Bracket markets (To Make Semifinal, To
// Make the Finals, Champion, League of Winner, Exact Result) are also real
// and verifiable — Savant's feed tags every HR with summary.matchup (the
// bracket pairing index) and summary.batterMatchupHrs (that player's HR
// count within their own matchup), confirmed directly against the live
// feed, and status.state flips to "Final" once the whole event (including
// Round 3) is actually decided — also confirmed directly, not guessed.
// Player to Win the HR Derby and All-Star Game MVP still isn't covered:
// that depends on the separate All-Star Game itself, which this feed has
// zero visibility into. The swing-off tiebreaker market also stays
// uncovered — no record of whether one occurred earlier in the broadcast.
// Round 1 First Swing to be a HR/Laser IS covered, but not from this feed
// (it only records completed HR events, not every swing) — FIRST_SWING_RESULTS
// below is confirmed ground truth from watching tonight's broadcast.
import type { DerbyPlayer } from '@/components/dugout/HrDerbyTable'
import { PLAYER_MARKETS, LEAGUE_MARKET, TOTAL_MARKETS, FT500_MARKET, PROP_LINES, COMBINE_MARKETS, H2H_MARKETS, EXACT_RESULT, FINALISTS, DOUBLE_CHANCE } from './hrDerbyOdds'

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

export type LiveStatusLike = { currentRound: number; state?: string } | null

// Only the 8 teams that matter here (the derby field) — not a general
// league lookup, just enough to settle "League of Winner" off the
// champion's real team.
const TEAM_LEAGUE: Record<string, 'American League' | 'National League'> = {
  CWS: 'American League', KC: 'American League', BOS: 'American League', TB: 'American League', NYY: 'American League',
  PHI: 'National League', STL: 'National League',
}

// Whether each player's very first Round 1 swing was a home run / a laser
// (110+ MPH) — this feed only records completed HR events, not swing-by-
// swing outcomes, so a non-HR first swing can't be derived from the API.
// Confirmed ground truth from watching tonight's broadcast.
const FIRST_SWING_RESULTS: Record<string, { hr: boolean; laser: boolean }> = {
  'Willson Contreras': { hr: false, laser: false },
  'Jordan Walker': { hr: true, laser: true },
  'Jac Caglianone': { hr: false, laser: false },
  'Munetaka Murakami': { hr: true, laser: false },
  'Ben Rice': { hr: false, laser: false },
  'Junior Caminero': { hr: true, laser: true },
  'Kyle Schwarber': { hr: false, laser: false },
  'Bryce Harper': { hr: false, laser: false },
}

// players is empty for field-wide markets (totals, 500ft-HR count) that
// aren't tied to any one participant.
export type CashedProp = { key: string; players: string[]; category: string; prop: string; odds: number }

export function fmtCashOdds(o: number) { return o > 0 ? `+${o}` : `${o}` }

// Winner+loser of every fully-decided round+matchup pairing, keyed off the
// real bracket data (not a guess at seeding) — a matchup only resolves here
// once both of its players have at least one recorded HR event in that
// round; a 0-HR round for a competitor (essentially never happens in a real
// derby round) would leave that matchup unresolved rather than risk a
// wrong call. A tied matchup (real derbies settle those with a swing-off)
// is also left unresolved here rather than arbitrarily picking a side.
function matchupResults(hrs: LiveHr[], round: number): { winner: string; loser: string }[] {
  const byMatchup = new Map<number, Map<number, { name: string; max: number }>>()
  for (const h of hrs) {
    if (h.round !== round || h.matchup == null || h.batterMatchupHrs == null) continue
    let m = byMatchup.get(h.matchup)
    if (!m) { m = new Map(); byMatchup.set(h.matchup, m) }
    const cur = m.get(h.playerId) ?? { name: h.playerName, max: 0 }
    cur.max = Math.max(cur.max, h.batterMatchupHrs)
    m.set(h.playerId, cur)
  }
  const results: { winner: string; loser: string }[] = []
  for (const playersInMatchup of byMatchup.values()) {
    const entries = Array.from(playersInMatchup.values())
    if (entries.length !== 2 || entries[0].max === entries[1].max) continue
    const [winner, loser] = entries[0].max > entries[1].max ? [entries[0], entries[1]] : [entries[1], entries[0]]
    results.push({ winner: winner.name, loser: loser.name })
  }
  return results
}

// Every player tied for the field lead on some value (round-1 HR count,
// whole-derby longest distance, whole-derby highest EV, etc.) — 1 name
// means an outright leader, 2+ means a genuine tie (pushes/voids for all
// of them, no loser among the tied group since none of them actually lost
// to another).
function leadersByValue(valueByMlbId: Map<number, number>, players: DerbyPlayer[]): string[] {
  let max = -1
  for (const p of players) max = Math.max(max, valueByMlbId.get(p.mlbId) ?? 0)
  if (max <= 0) return []
  return players.filter(p => (valueByMlbId.get(p.mlbId) ?? 0) === max).map(p => p.name)
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
      const leaders = leadersByValue(round1CountByPlayer, players)
      if (leaders.length === 1) {
        const opt = mostHrMarket.options.find(o => o.player === leaders[0])
        if (opt) cashed.push({ key: `mosthr-r1-${leaders[0]}`, players: [leaders[0]], category: 'Round 1', prop: 'Most HRs in Round 1 (outright)', odds: opt.odds })
      }
    }
    for (const [title, resultKey] of [
      ['Round 1 First Swing to be a Home Run', 'hr'],
      ['Round 1 First Swing to be a Laser (110MPH+)', 'laser'],
    ] as const) {
      const market = PLAYER_MARKETS.find(m => m.title === title)
      if (!market) continue
      for (const opt of market.options) {
        const r = FIRST_SWING_RESULTS[opt.player]
        if (r && r[resultKey]) cashed.push({ key: `firstswing-${resultKey}-${opt.player}`, players: [opt.player], category: 'Round 1', prop: title, odds: opt.odds })
      }
    }
    const semiMarket = PLAYER_MARKETS.find(m => m.title === 'To Make Semifinal')
    for (const { winner: name } of matchupResults(hrs, 1)) {
      const opt = semiMarket?.options.find(o => o.player === name)
      if (opt) cashed.push({ key: `bracket-semi-${name}`, players: [name], category: 'Bracket', prop: 'Advanced to Semifinal (won Round 1 matchup)', odds: opt.odds })
    }
  }
  if (currentRound > 2) {
    const finalsMarket = PLAYER_MARKETS.find(m => m.title === 'To Make the Finals')
    for (const { winner: name } of matchupResults(hrs, 2)) {
      const opt = finalsMarket?.options.find(o => o.player === name)
      if (opt) cashed.push({ key: `bracket-finals-${name}`, players: [name], category: 'Bracket', prop: 'Advanced to the Finals (won Semifinal matchup)', odds: opt.odds })
    }
  }

  // Champion / League of Winner / Exact Result — only once the whole event
  // is actually over (status.state === 'Final', confirmed against the real
  // feed once tonight's derby finished), so Round 3 is truly decided too.
  if (status?.state === 'Final') {
    const finalResult = matchupResults(hrs, 3)[0]
    if (finalResult) {
      const champMarket = PLAYER_MARKETS.find(m => m.title === 'HR Derby Champion')
      const champOpt = champMarket?.options.find(o => o.player === finalResult.winner)
      if (champOpt) cashed.push({ key: `champion-${finalResult.winner}`, players: [finalResult.winner], category: 'Champion', prop: 'HR Derby Champion', odds: champOpt.odds })

      const champPlayer = players.find(p => p.name === finalResult.winner)
      const league = champPlayer ? TEAM_LEAGUE[champPlayer.teamAbbr] : undefined
      const leagueOpt = league ? LEAGUE_MARKET.options.find(o => o.player === league) : undefined
      if (leagueOpt) cashed.push({ key: `league-${league}`, players: [], category: 'League', prop: 'League of Winner', odds: leagueOpt.odds })

      const exactOpt = EXACT_RESULT.find(e => e.a === finalResult.winner && e.b === finalResult.loser)
      if (exactOpt) cashed.push({ key: `exact-${finalResult.winner}-${finalResult.loser}`, players: [finalResult.winner, finalResult.loser], category: 'Champion', prop: `${finalResult.winner} over ${finalResult.loser} — Exact Result`, odds: exactOpt.odds })
    }

    // Whole-derby outright markets (Longest HR, Highest Exit Velo) — only
    // settle a winner once no tie exists; a genuine tie pushes for everyone
    // tied and never appears here as a "win."
    const longestMarket = PLAYER_MARKETS.find(m => m.title === 'Player to Hit the Longest Home Run')
    const longestLeaders = leadersByValue(maxDistByPlayer, players)
    if (longestMarket && longestLeaders.length === 1) {
      const opt = longestMarket.options.find(o => o.player === longestLeaders[0])
      if (opt) cashed.push({ key: `longest-hr-${longestLeaders[0]}`, players: [longestLeaders[0]], category: 'Champion', prop: 'Player to Hit the Longest Home Run', odds: opt.odds })
    }
    const evMarket = PLAYER_MARKETS.find(m => m.title === 'Player to Hit the Home Run with the Highest Exit Velocity')
    const evLeaders = leadersByValue(maxEvByPlayer, players)
    if (evMarket && evLeaders.length === 1) {
      const opt = evMarket.options.find(o => o.player === evLeaders[0])
      if (opt) cashed.push({ key: `highest-ev-${evLeaders[0]}`, players: [evLeaders[0]], category: 'Champion', prop: 'Player to Hit the Home Run with the Highest Exit Velocity', odds: opt.odds })
    }

    // Whole-derby Under sides — only confirmable once the derby is fully
    // over and these numbers can't move anymore.
    for (const pl of PROP_LINES) {
      const mlbId = byName.get(pl.player)
      if (mlbId == null) continue
      if (pl.label.includes('Longest') && (maxDistByPlayer.get(mlbId) ?? 0) < pl.line) {
        cashed.push({ key: `pl-${pl.player}-longest-under`, players: [pl.player], category: 'Prop Line', prop: `Under ${pl.line} ft Longest HR`, odds: pl.underOdds })
      } else if (pl.label.includes('Exit Velocity') && (maxEvByPlayer.get(mlbId) ?? 0) < pl.line) {
        cashed.push({ key: `pl-${pl.player}-ev-under`, players: [pl.player], category: 'Prop Line', prop: `Under ${pl.line} MPH Exit Velo`, odds: pl.underOdds })
      }
    }
    for (const m of TOTAL_MARKETS) {
      const thMatch = m.title.match(/—\s*([\d.]+)\s*$/)
      if (!thMatch) continue
      const threshold = parseFloat(thMatch[1])
      const underOpt = m.options.find(o => /^Under/i.test(o.player))
      if (!underOpt) continue
      if (m.title.startsWith('Total Home Runs Hit By All Players') && seasonTotal < threshold) {
        cashed.push({ key: `t-${m.title}-under`, players: [], category: 'Total', prop: `${m.title.split('—')[0].trim()} — Under ${threshold}`, odds: underOpt.odds })
      } else if (m.title.startsWith('Highest Exit Velocity') && maxEvAll < threshold) {
        cashed.push({ key: `t-${m.title}-under`, players: [], category: 'Total', prop: `${m.title.split('—')[0].trim()} — Under ${threshold}`, odds: underOpt.odds })
      }
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
//   league::<American League|National League>
//   exactresult::<a>::<b>
// Deliberately no keys for MVP (depends on the separate All-Star Game) or
// the Round 1 First Swing / swing-off tiebreaker markets (this feed only
// records actual HR events, not every swing or prior tiebreaker history).
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
  const seasonTotal = hrs.length
  const maxEvAll = hrs.reduce((mx, h) => Math.max(mx, h.exitVelocity ?? 0), 0)
  const ft500Count = hrs.filter(h => (h.distance ?? 0) >= 500).length
  const currentRound = status?.currentRound ?? 0
  const round1Final = currentRound > 1
  const round2Final = currentRound > 2
  const derbyFinal = status?.state === 'Final'
  const round1Winners = round1Final ? new Set(matchupResults(hrs, 1).map(r => r.winner)) : new Set<string>()
  const round2Winners = round2Final ? new Set(matchupResults(hrs, 2).map(r => r.winner)) : new Set<string>()
  const finalResult = derbyFinal ? matchupResults(hrs, 3)[0] : undefined

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
      const leaders = leadersByValue(round1CountByPlayer, players)
      for (const opt of m.options) {
        if (leaders.length > 1 && leaders.includes(opt.player)) settled.set(`pm::${m.title}::${opt.player}`, 'void')
        else settled.set(`pm::${m.title}::${opt.player}`, leaders[0] === opt.player ? 'won' : 'lost')
      }
    }
    if (m.title === 'Player to Hit the Longest Home Run' && derbyFinal) {
      const leaders = leadersByValue(maxDistByPlayer, players)
      for (const opt of m.options) {
        if (leaders.length > 1 && leaders.includes(opt.player)) settled.set(`pm::${m.title}::${opt.player}`, 'void')
        else settled.set(`pm::${m.title}::${opt.player}`, leaders[0] === opt.player ? 'won' : 'lost')
      }
    }
    if (m.title === 'Player to Hit the Home Run with the Highest Exit Velocity' && derbyFinal) {
      const leaders = leadersByValue(maxEvByPlayer, players)
      for (const opt of m.options) {
        if (leaders.length > 1 && leaders.includes(opt.player)) settled.set(`pm::${m.title}::${opt.player}`, 'void')
        else settled.set(`pm::${m.title}::${opt.player}`, leaders[0] === opt.player ? 'won' : 'lost')
      }
    }
    if (m.title === 'Round 1 First Swing to be a Home Run') {
      for (const opt of m.options) {
        const r = FIRST_SWING_RESULTS[opt.player]
        if (r) settled.set(`pm::${m.title}::${opt.player}`, r.hr ? 'won' : 'lost')
      }
    }
    if (m.title === 'Round 1 First Swing to be a Laser (110MPH+)') {
      for (const opt of m.options) {
        const r = FIRST_SWING_RESULTS[opt.player]
        if (r) settled.set(`pm::${m.title}::${opt.player}`, r.laser ? 'won' : 'lost')
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
    if (m.title === 'HR Derby Champion' && finalResult) {
      for (const opt of m.options) settled.set(`pm::${m.title}::${opt.player}`, opt.player === finalResult.winner ? 'won' : 'lost')
    }
  }

  if (finalResult) {
    const champPlayer = players.find(p => p.name === finalResult.winner)
    const winningLeague = champPlayer ? TEAM_LEAGUE[champPlayer.teamAbbr] : undefined
    if (winningLeague) {
      for (const opt of LEAGUE_MARKET.options) settled.set(`league::${opt.player}`, opt.player === winningLeague ? 'won' : 'lost')
    }
    for (const e of EXACT_RESULT) {
      settled.set(`exactresult::${e.a}::${e.b}`, e.a === finalResult.winner && e.b === finalResult.loser ? 'won' : 'lost')
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
      const actual = m.title.startsWith('Total Home Runs Hit By All Players') ? seasonTotal : maxEvAll
      const overOpt = m.options.find(o => /^Over/i.test(o.player))
      const underOpt = m.options.find(o => /^Under/i.test(o.player))
      if (actual > threshold) {
        if (overOpt) settled.set(`tot::${m.title}::${overOpt.player}`, 'won')
        if (underOpt) settled.set(`tot::${m.title}::${underOpt.player}`, 'lost')
      } else if (derbyFinal) {
        // Only confirmable once the derby is fully over — the number can't
        // move anymore, so a value still under the line at that point means
        // Under actually won, not just "hasn't cashed yet."
        if (underOpt) settled.set(`tot::${m.title}::${underOpt.player}`, 'won')
        if (overOpt) settled.set(`tot::${m.title}::${overOpt.player}`, 'lost')
      }
    }
  }

  for (const opt of FT500_MARKET.options) {
    const threshold = parseInt(opt.player)
    if (ft500Count >= threshold) settled.set(`ft500::${opt.player}`, 'won')
    else if (derbyFinal) settled.set(`ft500::${opt.player}`, 'lost')
  }

  for (const pl of PROP_LINES) {
    const mlbId = byName.get(pl.player)
    if (mlbId == null) continue
    if (pl.label.includes('Longest')) {
      const max = maxDistByPlayer.get(mlbId) ?? 0
      if (max > pl.line) { settled.set(`propline::${pl.player}::${pl.label}::over`, 'won'); settled.set(`propline::${pl.player}::${pl.label}::under`, 'lost') }
      else if (derbyFinal) { settled.set(`propline::${pl.player}::${pl.label}::over`, 'lost'); settled.set(`propline::${pl.player}::${pl.label}::under`, 'won') }
    } else if (pl.label.includes('Exit Velocity')) {
      const max = maxEvByPlayer.get(mlbId) ?? 0
      if (max > pl.line) { settled.set(`propline::${pl.player}::${pl.label}::over`, 'won'); settled.set(`propline::${pl.player}::${pl.label}::under`, 'lost') }
      else if (derbyFinal) { settled.set(`propline::${pl.player}::${pl.label}::over`, 'lost'); settled.set(`propline::${pl.player}::${pl.label}::under`, 'won') }
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
