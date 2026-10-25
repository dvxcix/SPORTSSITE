import { NextResponse } from 'next/server'
import {
  getPitcherStarts, getBatterGames, fetchManyGamePitchEvents,
  pitcherRowsByHand, batterRowsByPitchTypeAndHand,
} from '@slipsurge/core/pitchLog'
import { requireTier } from '@/lib/requireTier'
import { getMlbResearchGame } from '@/lib/dugoutData'
import { mlbPregameResearch, mlbPregameResearchOpen, readMlbPregameResearch, MlbPregameResearchUnavailable } from '@/lib/mlbPregameResearchData'

export const revalidate = 0
const headers = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }
type BoardRoster = {
  homePitcher?: { id: number } | null; awayPitcher?: { id: number } | null
  homeLineup?: { mlb_id: number }[]; awayLineup?: { mlb_id: number }[]
}

async function loadWindow(pitcherId: number, batterIds: number[], games: number, season: number, beforeGame?: { gamePk: number; date: string }, prior?: { batters?: Record<string, unknown> }) {
  const [pitcherStartsAll, batterGameLists] = await Promise.all([
    getPitcherStarts(pitcherId, season),
    Promise.all(batterIds.map(id => getBatterGames(id, season))),
  ])
  const eligible = (row: { gamePk: number; date: string }) => !beforeGame || (row.gamePk !== beforeGame.gamePk && row.date <= beforeGame.date)
  const pitcherStarts = pitcherStartsAll.filter(eligible).slice(-games)
  const batterOwnGames = new Map<number, Set<number>>()
  batterIds.forEach((id, i) => {
    if (!batterGameLists[i].length && Object.keys(prior?.batters?.[String(id)] ?? {}).length) throw new Error('Batter game-log observation incomplete')
    const recent = batterGameLists[i].filter(eligible).slice(-games)
    batterOwnGames.set(id, new Set(recent.map(g => g.gamePk)))
  })
  if (!pitcherStarts.length) throw new Error('No starts available for this pitcher window')
  const allGamePks = [...pitcherStarts.map(g => g.gamePk), ...Array.from(batterOwnGames.values()).flatMap(s => Array.from(s))]
  const events = await fetchManyGamePitchEvents(allGamePks)
  const observedGameIds = new Set(events.map(event => event.gamePk))
  if (allGamePks.some(id => !observedGameIds.has(id))) throw new Error('Pitch event observation incomplete')
  const pitcherGameIds = new Set(pitcherStarts.map(start => start.gamePk))
  const pitcherRows = pitcherRowsByHand(events.filter(event => pitcherGameIds.has(event.gamePk)), pitcherId)
  const batters: Record<string, Record<string, { R?: any; L?: any }>> = {}
  for (const id of batterIds) batters[String(id)] = batterRowsByPitchTypeAndHand(events, id, batterOwnGames.get(id) ?? new Set())
  return { window: { games: pitcherStarts.length, dateFrom: pitcherStarts[0]?.date ?? null, dateTo: pitcherStarts[pitcherStarts.length - 1]?.date ?? null }, pitcherRows, batters }
}

// Default research is anchored to an exact matchup. Explicit live requests may
// inspect current form; they never write into the shared pregame archive.
export async function GET(req: Request) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error
  const { searchParams } = new URL(req.url)
  const pitcherId = Number(searchParams.get('pitcherId'))
  const games = Math.min(10, Math.max(1, Math.trunc(Number(searchParams.get('games'))) || 3))
  if (!Number.isSafeInteger(pitcherId) || pitcherId <= 0) return NextResponse.json({ error: 'pitcherId is required' }, { status: 400 })
  try {
    if (searchParams.get('mode') === 'live') {
      const season = Number(searchParams.get('season')) || new Date().getFullYear()
      const batterIds = [...new Set((searchParams.get('batterIds') || '').split(',').map(Number).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 40)
      return NextResponse.json({ ...await loadWindow(pitcherId, batterIds, games, season), researchSnapshot: { mode: 'live' } }, { headers })
    }
    const gamePk = Number(searchParams.get('gamePk'))
    const date = searchParams.get('date') || ''
    if (!Number.isSafeInteger(gamePk) || gamePk <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'gamePk and date are required for pregame research' }, { status: 400, headers })
    const game = await getMlbResearchGame(date, gamePk)
    if (!game) return NextResponse.json({ error: 'Game not found on this date' }, { status: 404, headers })
    const resource = `pitcher-window:${pitcherId}:${games}`
    const snapshot = await mlbPregameResearch(game, async () => {
      const board = await readMlbPregameResearch<BoardRoster>(game)
      if (!board || board.frozen) throw new MlbPregameResearchUnavailable()
      const roster = board.value
      const lineup = Number(roster.homePitcher?.id) === pitcherId ? roster.awayLineup
        : Number(roster.awayPitcher?.id) === pitcherId ? roster.homeLineup : null
      if (!lineup?.length) throw new MlbPregameResearchUnavailable()
      // The key identifies this game's canonical starter and opposing roster,
      // not caller-supplied batter IDs or an unrelated season.
      const batterIds = [...new Set(lineup.map(player => Number(player.mlb_id)).filter(id => Number.isSafeInteger(id) && id > 0))]
      const prior = await readMlbPregameResearch<{ batters?: Record<string, unknown> }>(game, resource)
      if (!mlbPregameResearchOpen(game) || prior?.frozen) throw new MlbPregameResearchUnavailable()
      const value = await loadWindow(pitcherId, batterIds, games, new Date(game.gameDate).getUTCFullYear(), { gamePk, date }, prior?.value)
      return { value, observedAt: new Date().toISOString() }
    }, resource)
    return NextResponse.json({ ...snapshot.value, researchSnapshot: { mode: 'pregame', observedAt: snapshot.observedAt, frozen: snapshot.frozen } }, { headers })
  } catch (error) {
    if (error instanceof MlbPregameResearchUnavailable) return NextResponse.json({ error: 'Pregame pitcher-window snapshot unavailable', unavailable: true }, { status: 503, headers })
    console.warn('[pitcher-report/live-window] observation unavailable', { type: error instanceof Error ? error.name : typeof error })
    return NextResponse.json({ error: 'Pitcher window unavailable' }, { status: 503, headers })
  }
}
