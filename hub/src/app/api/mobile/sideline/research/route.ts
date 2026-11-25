import { GET as slateEdge } from '@/app/api/the-sideline/slate-edge/route'
import { NextRequest, NextResponse } from 'next/server'
import { getCachedSidelineBoardLens, getCachedSidelineCheatsheetLens, getSidelineGames, getSidelineOddsBundle } from '@/app/the-sideline/data'
import type { SidelineRosterPlayer, SidelineWindow } from '@/app/the-sideline/types'
import { requireNflAccess } from '@/lib/nflAccess'
import { defaultNflSample, nflSampleReference, parseNflSample } from '@/lib/nflSample'
import { nflPregameOpen } from '@/lib/nflPregameResearchData'
import { nativeNflCheatsheets, nativeNflMismatch } from '@/lib/nativeNflResearch'
import { loadNflMatrices } from '@/lib/nflMatrixData'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 120
const headers = { 'Cache-Control': 'private, no-store' }
const windows = ['season', 'l1', 'l3', 'l5', 'l10'] as const
const validSample = (sample: string | null) => sample == null || ['previous', 'preseason', 'regular'].includes(sample)
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date

export async function GET(request: NextRequest) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const params = request.nextUrl.searchParams
  if (params.get('tool') === 'slate-edge') {
    const date = params.get('date') ?? '', sample = params.get('sample')
    if (!validDate(date) || !validSample(sample)) {
      return NextResponse.json({ error: 'Invalid NFL Slate Edge filters' }, { status: 400, headers })
    }
    return slateEdge(request)
  }
  const gate = await requireNflAccess()
  if (gate.error) return gate.error
  if (gate.userId !== account.userId) return NextResponse.json({ error: 'NFL access unavailable' }, { status: 403, headers })
  const id = params.get('game') ?? '', exactDate = params.get('date') ?? ''
  const tool = params.get('tool'), market = params.get('market') ?? 'anytime_td', book = params.get('book') ?? 'fanduel'
  const window = params.get('window') ?? 'season', sample = params.get('sample')
  if (!/^[\w-]{1,64}$/.test(id) || !validDate(exactDate) ||
    (tool !== 'mm' && tool !== 'cheatsheets') || !/^[a-z0-9_]{1,60}$/.test(market) ||
    !/^[a-z0-9_]{1,30}$/.test(book) || !windows.includes(window as SidelineWindow) ||
    !validSample(sample)) {
    return NextResponse.json({ error: 'Invalid NFL research filters' }, { status: 400, headers })
  }

  try {
    const schedule = await getSidelineGames(undefined, id)
    const game = schedule.date === exactDate ? schedule.games.find(item => item.id === id) : undefined
    if (!game) return NextResponse.json({ error: 'Matchup not found' }, { status: 404, headers })
    const reference = sample == null ? defaultNflSample(game) : parseNflSample(sample)
    const matricesPromise = tool === 'mm' ? loadNflMatrices(account.userId) : null
    const marketView = async () => (await getSidelineOddsBundle(game)).odds
    const load = async () => {
      const board = await marketView()
      if (tool === 'cheatsheets') {
        const lens = await getCachedSidelineCheatsheetLens(game, reference)
        return { board, lens, projection: nativeNflCheatsheets(lens, board, market, book) }
      }
      const roster: SidelineRosterPlayer[] = [...board.players, ...(board.availabilityPlayers ?? [])].map(player => ({
        id: player.gsisId ?? `bdl-${player.id}`, bdlId: player.id, teamId: player.teamId ?? null,
        team: player.team, name: player.name, position: player.position,
      }))
      const [lens, matrixResult] = await Promise.all([getCachedSidelineBoardLens(game, roster, reference), matricesPromise])
      const projection = nativeNflMismatch(game, lens, window as SidelineWindow, board, market, matrixResult?.data ?? [])
      return { board, lens, projection: { ...projection, matricesUnavailable: Boolean(matrixResult?.error) } }
    }
    const beganOpen = nflPregameOpen(game)
    let result = await load()
    if (beganOpen && !nflPregameOpen(game)) result = await load()
    return NextResponse.json({
      gameId: game.id, date: game.gameday, tool, market, book, window, sample: reference,
      sampleLabel: nflSampleReference(game.season, reference).label,
      status: result.lens.status, availabilityStale: result.board.availabilityStale === true,
      cutoffAt: result.board.availabilityCutoffAt ?? null, capturedAt: result.board.capturedAt,
      ...result.projection,
    }, { headers })
  } catch {
    return NextResponse.json({ error: 'NFL research could not refresh' }, { status: 503, headers })
  }
}
