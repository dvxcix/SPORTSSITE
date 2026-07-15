import { NextResponse } from 'next/server'

export const revalidate = 0

// Same real game as /api/allstar/data — see that route's comment for how
// this gamePk was confirmed. Split into its own fast-polling endpoint since
// this only needs the live boxscore + play-by-play, not the full
// roster/Statcast join.
const ASG_GAME_PK = 823443

const EMPTY = {
  gameState: null, players: {}, firstPaResult: {}, firstHrMlbId: null,
  innings: [], teamTotals: { awayRuns: 0, homeRuns: 0, awayHits: 0, homeHits: 0 }, scoreProgression: [],
  firstPitch: { top: null, bottom: null },
  playerStatus: {}, currentBatterId: null, onDeckBatterId: null, currentPitcherId: null,
}

// Real pitch-level detail for the very first pitch of a half-inning — same
// playEvents-filtered-by-type-'pitch' pattern /sports' own live MLB game
// page already uses (hub/src/lib/mlb-api.ts's pitch parsing), just read
// server-side here instead of client-side.
function firstPitchOf(play: any) {
  const pitches = (play?.playEvents ?? []).filter((e: any) => e.type === 'pitch')
  if (pitches.length === 0) return null
  const p = pitches[0]
  return {
    isBall: !!p.details?.isBall,
    isStrike: !!p.details?.isStrike,
    isInPlay: !!p.details?.isInPlay,
    isHbp: /hit by pitch/i.test(p.details?.description ?? ''),
    startSpeed: p.pitchData?.startSpeed ?? null,
    resultEvent: play?.result?.event ?? null,
    pitcherName: play?.matchup?.pitcher?.fullName ?? null,
  }
}

export async function GET() {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${ASG_GAME_PK}/feed/live`, {
      cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
    })
    if (!res.ok) {
      return NextResponse.json(EMPTY, { headers: { 'Cache-Control': 'no-store' } })
    }
    const feed = await res.json()

    const gameState: string | null = feed.gameData?.status?.abstractGameState ?? null

    // Real per-player counting stats straight from MLB's own live boxscore —
    // already aggregated server-side by MLB, no need to sum play-by-play.
    const players: Record<number, {
      hits: number; hr: number; doubles: number; triples: number
      rbi: number; runs: number; totalBases: number; pa: number
    }> = {}
    const boxTeams = feed.liveData?.boxscore?.teams ?? {}
    for (const side of ['away', 'home'] as const) {
      const raw = boxTeams[side]?.players ?? {}
      for (const key of Object.keys(raw)) {
        const p = raw[key]
        const b = p.stats?.batting
        const id = p.person?.id
        if (!b || !id) continue
        players[id] = {
          hits: b.hits ?? 0, hr: b.homeRuns ?? 0, doubles: b.doubles ?? 0, triples: b.triples ?? 0,
          rbi: b.rbi ?? 0, runs: b.runs ?? 0, totalBases: b.totalBases ?? 0, pa: b.plateAppearances ?? 0,
        }
      }
    }

    // First-PA result per batter, the game's real chronological first HR,
    // and the running away/home score after every completed play — none of
    // this is in the boxscore aggregates above, only derivable from play
    // order (used for Race-To-N-Runs markets).
    const allPlays = feed.liveData?.plays?.allPlays ?? []
    const seenFirstPa = new Set<number>()
    const firstPaResult: Record<number, 'hr' | 'other'> = {}
    let firstHrMlbId: number | null = null
    const scoreProgression: { away: number; home: number }[] = []
    for (const play of allPlays) {
      if (!play.about?.isComplete) continue
      const batterId = play.matchup?.batter?.id
      const eventType = play.result?.eventType
      if (batterId && !seenFirstPa.has(batterId)) {
        seenFirstPa.add(batterId)
        firstPaResult[batterId] = eventType === 'home_run' ? 'hr' : 'other'
      }
      if (eventType === 'home_run' && batterId != null && firstHrMlbId == null) {
        firstHrMlbId = batterId
      }
      scoreProgression.push({ away: play.result?.awayScore ?? 0, home: play.result?.homeScore ?? 0 })
    }

    // Real per-inning + running team totals straight from MLB's own
    // linescore — backs every innings/team-total market on the page.
    const linescore = feed.liveData?.linescore
    const innings = (linescore?.innings ?? []).map((i: any) => ({
      num: i.num,
      awayRuns: i.away?.runs ?? null, homeRuns: i.home?.runs ?? null,
      awayHits: i.away?.hits ?? null, homeHits: i.home?.hits ?? null,
    }))
    const teamTotals = {
      awayRuns: linescore?.teams?.away?.runs ?? 0, homeRuns: linescore?.teams?.home?.runs ?? 0,
      awayHits: linescore?.teams?.away?.hits ?? 0, homeHits: linescore?.teams?.home?.hits ?? 0,
    }

    const topFirstPlay = allPlays.find((p: any) => p.about?.inning === 1 && p.about?.halfInning === 'top')
    const bottomFirstPlay = allPlays.find((p: any) => p.about?.inning === 1 && p.about?.halfInning === 'bottom')
    const firstPitch = { top: firstPitchOf(topFirstPlay), bottom: firstPitchOf(bottomFirstPlay) }

    // Real real-time roster status — MLB's own boxscore already flags the
    // exact current batter/pitcher per player (gameStatus), plus the live
    // batting order (who's actually active in the lineup right now, updated
    // the instant a substitution happens) and each player's own recorded
    // plate appearances / innings pitched to tell "hasn't played yet" from
    // "already played and has since been replaced." No guessing which
    // player is in — this is the same data MLB.com itself uses.
    const playerStatus: Record<number, 'in' | 'not_played' | 'done'> = {}
    for (const side of ['away', 'home'] as const) {
      const team = boxTeams[side]
      if (!team) continue
      const battingOrderSet = new Set<number>(team.battingOrder ?? [])
      const raw = team.players ?? {}
      for (const key of Object.keys(raw)) {
        const p = raw[key]
        const id = p.person?.id
        if (!id) continue
        const isPitcher = p.position?.code === '1' || p.position?.abbreviation === 'P'
        if (isPitcher) {
          const battersFaced = p.stats?.pitching?.battersFaced ?? 0
          const pitched = battersFaced > 0
          if (p.gameStatus?.isCurrentPitcher) playerStatus[id] = 'in'
          else if (pitched) playerStatus[id] = 'done'
          else playerStatus[id] = 'not_played'
        } else {
          const pa = p.stats?.batting?.plateAppearances ?? 0
          if (battingOrderSet.has(id)) playerStatus[id] = 'in'
          else if (pa > 0) playerStatus[id] = 'done'
          else playerStatus[id] = 'not_played'
        }
      }
    }
    const currentBatterId = linescore?.offense?.batter?.id ?? null
    const onDeckBatterId = linescore?.offense?.onDeck?.id ?? null
    const currentPitcherId = linescore?.defense?.pitcher?.id ?? null

    return NextResponse.json(
      {
        gameState, players, firstPaResult, firstHrMlbId, innings, teamTotals, scoreProgression, firstPitch,
        playerStatus, currentBatterId, onDeckBatterId, currentPitcherId,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
    )
  } catch {
    return NextResponse.json(EMPTY, { headers: { 'Cache-Control': 'no-store' } })
  }
}
