import { NextResponse } from 'next/server'
import {
  getPitcherStarts, getBatterGames, fetchManyGamePitchEvents,
  pitcherRowsByHand, batterRowsByPitchTypeAndHand,
} from '@/lib/pitchLog'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

// True "last N starts" (pitcher) / "last N games" (each batter) pitch-mix,
// computed live from MLB's free Gumbo feed rather than read from a
// pre-aggregated table — see src/lib/pitchLog.ts for why (the mlb-party
// pitch_type_recent tables only ever carry one fixed 14-day window).
// Heavier than the default /api/dugout/data merge, so this is its own
// opt-in endpoint the Pitcher Report page calls only when the user asks for
// a real N-start/N-game window instead of the 14-day one.
export async function GET(req: Request) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const pitcherId = Number(searchParams.get('pitcherId'))
  const batterIdsParam = searchParams.get('batterIds') || ''
  const games = Math.min(10, Math.max(1, Number(searchParams.get('games')) || 3))
  const season = Number(searchParams.get('season')) || new Date().getFullYear()
  const batterIds = batterIdsParam.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0)

  if (!pitcherId) {
    return NextResponse.json({ error: 'pitcherId is required' }, { status: 400 })
  }

  const [pitcherStartsAll, batterGameLists] = await Promise.all([
    getPitcherStarts(pitcherId, season),
    Promise.all(batterIds.map(id => getBatterGames(id, season))),
  ])

  const pitcherStarts = pitcherStartsAll.slice(-games)
  const batterOwnGames = new Map<number, Set<number>>()
  batterIds.forEach((id, i) => {
    const recent = batterGameLists[i].slice(-games)
    batterOwnGames.set(id, new Set(recent.map(g => g.gamePk)))
  })

  if (!pitcherStarts.length) {
    return NextResponse.json({
      error: `No starts found for pitcher ${pitcherId} in ${season} — too early in the season, or this player isn't a starter.`,
    }, { status: 404 })
  }

  const allGamePks = [
    ...pitcherStarts.map(g => g.gamePk),
    ...Array.from(batterOwnGames.values()).flatMap(s => Array.from(s)),
  ]
  const events = await fetchManyGamePitchEvents(allGamePks)

  const pitcherRows = pitcherRowsByHand(events, pitcherId)
  const batters: Record<string, Record<string, { R?: any; L?: any }>> = {}
  for (const id of batterIds) {
    const ownGames = batterOwnGames.get(id) ?? new Set()
    batters[String(id)] = batterRowsByPitchTypeAndHand(events, id, ownGames)
  }

  return NextResponse.json({
    window: {
      games: pitcherStarts.length,
      dateFrom: pitcherStarts[0]?.date ?? null,
      dateTo: pitcherStarts[pitcherStarts.length - 1]?.date ?? null,
    },
    pitcherRows,
    batters,
  }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } })
}
