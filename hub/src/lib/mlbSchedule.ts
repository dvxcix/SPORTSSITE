// Lean extraction of the schedule + probable-pitcher + lineup (confirmed or
// projected-from-active-roster) logic that src/app/api/dugout/data/route.ts
// already has proven correct in production — same team-abbreviation
// canonicalization, same batSide/pitchHand backfill workarounds for fields
// MLB's schedule hydration silently omits. Deliberately stripped of
// everything Dugout also does (odds snapshots, mlb-party splits, picks) —
// this is just "what game is X in today, who's he facing" for the player
// page's Matchup Explorer / Zone Profile default-to-today feature.
//
// Always fetched live, nothing persisted — same as Dugout/Pitcher Report,
// since MLB's own schedule/lineups/probable-pitcher data changes throughout
// the day (lineups post ~1-3h pregame, a probable starter can be swapped).

const TEAM_ABBR_ALIASES: Record<string, string> = {
  ARI: 'AZ', AZ: 'AZ',
  TBR: 'TB', TB: 'TB',
  SDP: 'SD', SD: 'SD',
  SFG: 'SF', SF: 'SF',
  KCR: 'KC', KC: 'KC',
  CHW: 'CWS', CWS: 'CWS',
  WSN: 'WSH', WSH: 'WSH',
}
const canonAbbr = (a: string) => TEAM_ABBR_ALIASES[(a || '').toUpperCase()] ?? (a || '').toUpperCase()

const POS_ORDER: Record<string, number> = {
  C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9, DH: 1, OF: 7, INF: 4,
}

export type LineupPlayer = {
  mlb_id: number; name: string; batting_order: number; position: string
  bats: string; team: string; team_name: string; projected: boolean
}
export type ProbablePitcher = { id: number; name: string; hand: string }
export type TodayGame = {
  gamePk: number; gameKey: string
  homeTeam: string; awayTeam: string; homeAbbr: string; awayAbbr: string
  homeTeamId: number | null; awayTeamId: number | null
  homePitcher: ProbablePitcher | null; awayPitcher: ProbablePitcher | null
  homeLineup: LineupPlayer[]; awayLineup: LineupPlayer[]
  homeLineupConfirmed: boolean; awayLineupConfirmed: boolean
  // MLB's own detailedState (e.g. "Scheduled", "Pre-Game", "Warmup",
  // "In Progress", "Delayed Start", "Postponed", "Final") — used by the
  // lineup-confirmed cron to also catch postponements/delays, not just
  // lineup posts.
  status: string
}

// Pregame = hasn't started and isn't cancelled — used by the Browserbase
// scrapers to decide whether a game is still worth checking (FanDuel/MGM
// odds and Pikkit's pick counts both stop mattering, or the page changes
// shape entirely, once a game goes live).
export const isPregame = (status: string) => !/in progress|final|postpon|cancel/i.test(status)

async function fetchProjectedLineup(teamId: number, teamAbbr: string, teamName: string): Promise<LineupPlayer[]> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=Active`, {
      cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
    })
    if (!res.ok) return []
    const roster: any[] = (await res.json()).roster ?? []
    const positionPlayers = roster.filter(p => p.position?.type !== 'Pitcher')

    // teams/{id}/roster never carries batSide — batch-fetch it separately
    // (same workaround dugout/data/route.ts uses) or every projected batter
    // silently defaults to unknown hand.
    const ids = positionPlayers.map(p => p.person?.id).filter(Boolean)
    const batSideById = new Map<number, string>()
    if (ids.length) {
      try {
        const peopleRes = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(',')}`, {
          cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
        })
        if (peopleRes.ok) {
          for (const person of (await peopleRes.json()).people ?? []) {
            if (person.id && person.batSide?.code) batSideById.set(person.id, person.batSide.code)
          }
        }
      } catch { /* projected lineup still usable without hand */ }
    }

    return positionPlayers
      .sort((a, b) => (POS_ORDER[a.position?.abbreviation] ?? 9) - (POS_ORDER[b.position?.abbreviation] ?? 9))
      .map((p, i) => ({
        mlb_id: p.person.id, name: p.person.fullName || '', batting_order: i + 1,
        position: p.position?.abbreviation || '?',
        bats: batSideById.get(p.person.id) || p.person.batSide?.code || '?',
        team: teamAbbr, team_name: teamName, projected: true,
      }))
  } catch { return [] }
}

// Real incident (2026-07-21, ~game time): every /api/posts/pick call started
// 409ing — "already started" — a full hour before that day's first pitch,
// for every user, every game. Root cause: this schedule call ran with
// cache: 'no-store' from every page that needs today's slate (Dugout,
// Pitcher Report, Slate Breakdown, Batter Cost, The Public, the composer,
// AND the posting gate below) — at real traffic near game time, that's
// enough uncached hits to statsapi.mlb.com from Vercel's shared egress IPs
// to get rate-limited. A non-ok/failed response here was silently treated
// as "found no games", which the posting gate then fails-closed on (treats
// "can't confirm this game is pregame" the same as "already started") —
// correct instinct for a genuinely bad/postponed game_pk, but not for a
// transient upstream hiccup, which then blocks every real user's real pick.
// One retry plus a short shared cache (dedupes concurrent requests within
// the window across every one of those callers) fixes the actual failure
// mode without loosening the real "already started" check at all.
export async function fetchScheduleWithRetry(
  date: string,
  hydrate = 'lineups,probablePitcher,team',
  attempts = 2
): Promise<any[]> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=${hydrate}`,
        { next: { revalidate: 15 }, headers: { 'User-Agent': 'SlipSurge/1.0' } }
      )
      if (res.ok) return (await res.json()).dates?.[0]?.games ?? []
    } catch { /* fall through to retry */ }
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 300))
  }
  return []
}

export async function getTodaysMatchups(date?: string): Promise<TodayGame[]> {
  const d = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  let mlbGames: any[] = []
  try {
    mlbGames = await fetchScheduleWithRetry(d)
  } catch { return [] }
  if (!mlbGames.length) return []

  // MLB's confirmed-lineup player objects carry only id/name/position, no
  // batSide — batch-fetch real hand for every player across every lineup.
  const lineupBatterIds = new Set<number>()
  for (const g of mlbGames) {
    for (const p of [...(g.lineups?.homePlayers || []), ...(g.lineups?.awayPlayers || [])]) {
      if (p?.id) lineupBatterIds.add(p.id)
    }
  }
  const batSideById = new Map<number, string>()
  if (lineupBatterIds.size) {
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${Array.from(lineupBatterIds).join(',')}`, {
        cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
      })
      if (res.ok) {
        for (const p of (await res.json()).people ?? []) {
          if (p.id && p.batSide?.code) batSideById.set(p.id, p.batSide.code)
        }
      }
    } catch { /* lineups still usable without hand */ }
  }

  // hydrate=probablePitcher never returns pitchHand — same batch-fetch
  // workaround for the starters.
  const pitcherIds = new Set<number>()
  for (const g of mlbGames) {
    if (g.teams?.home?.probablePitcher?.id) pitcherIds.add(g.teams.home.probablePitcher.id)
    if (g.teams?.away?.probablePitcher?.id) pitcherIds.add(g.teams.away.probablePitcher.id)
  }
  const pitcherHandById = new Map<number, string>()
  if (pitcherIds.size) {
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${Array.from(pitcherIds).join(',')}`, {
        cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
      })
      if (res.ok) {
        for (const p of (await res.json()).people ?? []) {
          if (p.id && p.pitchHand?.code) pitcherHandById.set(p.id, p.pitchHand.code)
        }
      }
    } catch { /* pitchers still usable without hand */ }
  }

  return Promise.all(mlbGames.map(async (g: any): Promise<TodayGame> => {
    const homeTeam = g.teams?.home?.team?.name || ''
    const awayTeam = g.teams?.away?.team?.name || ''
    const homeAbbr = canonAbbr(g.teams?.home?.team?.abbreviation || homeTeam.split(' ').pop() || '')
    const awayAbbr = canonAbbr(g.teams?.away?.team?.abbreviation || awayTeam.split(' ').pop() || '')
    const gameNum = g.gameNumber ?? 1
    const gameKey = gameNum > 1 ? `${awayAbbr}@${homeAbbr}-G${gameNum}` : `${awayAbbr}@${homeAbbr}`

    const homePitcher: ProbablePitcher | null = g.teams?.home?.probablePitcher
      ? { id: g.teams.home.probablePitcher.id, name: g.teams.home.probablePitcher.fullName, hand: pitcherHandById.get(g.teams.home.probablePitcher.id) ?? 'R' }
      : null
    const awayPitcher: ProbablePitcher | null = g.teams?.away?.probablePitcher
      ? { id: g.teams.away.probablePitcher.id, name: g.teams.away.probablePitcher.fullName, hand: pitcherHandById.get(g.teams.away.probablePitcher.id) ?? 'R' }
      : null

    const mkLineup = (players: any[], teamAbbr: string, teamName: string): LineupPlayer[] =>
      (players || []).map((p: any, i: number) => ({
        mlb_id: p.id, name: p.fullName || '', batting_order: i + 1,
        position: p.primaryPosition?.abbreviation || '?',
        bats: batSideById.get(p.id) || '?',
        team: teamAbbr, team_name: teamName, projected: false,
      }))

    let homeLineup = mkLineup(g.lineups?.homePlayers || [], homeAbbr, homeTeam)
    let awayLineup = mkLineup(g.lineups?.awayPlayers || [], awayAbbr, awayTeam)
    const homeTeamId = g.teams?.home?.team?.id ?? null
    const awayTeamId = g.teams?.away?.team?.id ?? null
    if (!homeLineup.length && homeTeamId) homeLineup = await fetchProjectedLineup(homeTeamId, homeAbbr, homeTeam)
    if (!awayLineup.length && awayTeamId) awayLineup = await fetchProjectedLineup(awayTeamId, awayAbbr, awayTeam)

    return {
      gamePk: g.gamePk, gameKey, homeTeam, awayTeam, homeAbbr, awayAbbr, homeTeamId, awayTeamId,
      homePitcher, awayPitcher, homeLineup, awayLineup,
      homeLineupConfirmed: (g.lineups?.homePlayers?.length ?? 0) > 0,
      awayLineupConfirmed: (g.lineups?.awayPlayers?.length ?? 0) > 0,
      status: g.status?.detailedState || g.status?.abstractGameState || 'Scheduled',
    }
  }))
}

export type PlayerTodayContext = {
  gameKey: string; team: string; teamName: string; opponentTeam: string; opponentTeamName: string
  role: 'batter' | 'pitcher'
  opponentPitcher: ProbablePitcher | null
  opponentLineup: LineupPlayer[]
  lineupConfirmed: boolean
}

// Scans every game's lineups/probable pitchers for this exact mlb_id —
// deliberately NOT keyed off players.current_team_id (that's a once-a-day
// cron-synced field that can lag a same-day trade/call-up); this is rebuilt
// from the live schedule every call, so it's only ever wrong if MLB's own
// data is, same tradeoff Dugout/Pitcher Report already make.
export function findPlayerToday(games: TodayGame[], mlbId: number): PlayerTodayContext | null {
  for (const g of games) {
    if (g.homePitcher?.id === mlbId) {
      return {
        gameKey: g.gameKey, team: g.homeAbbr, teamName: g.homeTeam, opponentTeam: g.awayAbbr, opponentTeamName: g.awayTeam,
        role: 'pitcher', opponentPitcher: null, opponentLineup: g.awayLineup, lineupConfirmed: g.awayLineupConfirmed,
      }
    }
    if (g.awayPitcher?.id === mlbId) {
      return {
        gameKey: g.gameKey, team: g.awayAbbr, teamName: g.awayTeam, opponentTeam: g.homeAbbr, opponentTeamName: g.homeTeam,
        role: 'pitcher', opponentPitcher: null, opponentLineup: g.homeLineup, lineupConfirmed: g.homeLineupConfirmed,
      }
    }
    if (g.homeLineup.some(p => p.mlb_id === mlbId)) {
      return {
        gameKey: g.gameKey, team: g.homeAbbr, teamName: g.homeTeam, opponentTeam: g.awayAbbr, opponentTeamName: g.awayTeam,
        role: 'batter', opponentPitcher: g.awayPitcher, opponentLineup: [], lineupConfirmed: g.homeLineupConfirmed,
      }
    }
    if (g.awayLineup.some(p => p.mlb_id === mlbId)) {
      return {
        gameKey: g.gameKey, team: g.awayAbbr, teamName: g.awayTeam, opponentTeam: g.homeAbbr, opponentTeamName: g.homeTeam,
        role: 'batter', opponentPitcher: g.homePitcher, opponentLineup: [], lineupConfirmed: g.awayLineupConfirmed,
      }
    }
  }
  return null
}

export type TeamPitcher = { id: number; name: string; hand: string }

// Every pitcher on a team's current active roster, not just today's
// probable starter — Slate Breakdown's "vs team" batter scope means "any
// pitcher from this staff might face him today" (the bullpen included),
// not literally just the announced starter.
export async function fetchTeamPitcherIds(teamId: number): Promise<TeamPitcher[]> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=Active`, {
      cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
    })
    if (!res.ok) return []
    const roster: any[] = (await res.json()).roster ?? []
    const pitchers = roster.filter(p => p.position?.type === 'Pitcher')
    const ids = pitchers.map(p => p.person?.id).filter(Boolean)
    const handById = new Map<number, string>()
    if (ids.length) {
      try {
        const peopleRes = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(',')}`, {
          cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
        })
        if (peopleRes.ok) {
          for (const p of (await peopleRes.json()).people ?? []) {
            if (p.id && p.pitchHand?.code) handById.set(p.id, p.pitchHand.code)
          }
        }
      } catch { /* pitcher list still usable without hand */ }
    }
    return pitchers.map(p => ({ id: p.person.id, name: p.person.fullName || '', hand: handById.get(p.person.id) ?? 'R' }))
  } catch { return [] }
}
