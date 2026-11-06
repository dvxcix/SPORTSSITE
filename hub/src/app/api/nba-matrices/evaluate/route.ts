import { nbaOddsMode } from '@/lib/nbaOddsMode'
import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaintBoard, getPaintGame } from '@/lib/nbaPaintData'
import { getNbaResearchDefense, getNbaResearchTracking, getNbaResearchMarketContext } from '@/lib/nbaResearchResources'
import { resolveNbaResearchBundle } from '@/lib/nbaResearchBundle'
import { evaluateNbaMatrix, nbaMatrixCandidates, type NbaMatrix } from '@/lib/nbaMatrix'
import { getNbaPublicCaptures } from '@/lib/nbaPublicData'
import { nbaMatrixSeasonGuard, nbaMatrixUnsafePipelineStep } from '@/lib/nbaMatrixSeason'

export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  const gameId = request.nextUrl.searchParams.get('game')
  if (!gameId || !/^\d{1,10}$/.test(gameId)) return NextResponse.json({ error: 'Choose an NBA game.' }, { status: 400 })
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('nba_matrices').select('*').eq('user_id', gate.userId!).eq('enabled', true).order('priority').order('created_at')
    if (error) throw error
    const matrices = data as NbaMatrix[]
    if (!matrices.length) return NextResponse.json({ gameId: Number(gameId), mode, matrices: [], matches: [], unavailable: [], fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } })
    const initial = await getPaintBoard(await getPaintGame(Number(gameId)), mode)
    const factors = matrices.flatMap(m => m.definition.factors ?? m.definition.steps ?? [])
    const needs = (category: string) => factors.some(f => f.category === category)
    const { board, value: { defense, market, tracking, picks, unavailable } } = await resolveNbaResearchBundle(initial, mode, async board => {
      const unavailable: string[] = []
      const [defense, market, tracking, picks] = await Promise.all([
        needs('score') ? getNbaResearchDefense(board, mode).catch(() => { unavailable.push('Defense context'); return null }) : null,
        needs('score') ? getNbaResearchMarketContext(board, mode).catch(() => { unavailable.push('Market signals'); return null }) : null,
        needs('tracking') ? getNbaResearchTracking(board, mode).catch(() => { unavailable.push('Tracking'); return null }) : null,
        needs('picks') ? getNbaPublicCaptures(board.game.id, mode, board.game).then(captures => captures[0]?.snapshot.rows ?? []).catch(() => { unavailable.push('Public picks'); return [] }) : [],
      ])
      return { defense, market, tracking, picks, unavailable: unavailable.sort() }
    })
    const needsScoreDetails = factors.some(factor => factor.category === 'score' && factor.field !== 'mm')
    if (needsScoreDetails && market == null) unavailable.push('Market signals')
    const scoreUnavailable = unavailable.includes('Defense context') || unavailable.includes('Market signals')
    const seasonProven = nbaMatrixSeasonGuard(board, defense, tracking)
    const proven = (id: string, factor: Parameters<typeof seasonProven>[1]) => seasonProven(id, factor)
      && !(scoreUnavailable && factor.category === 'score' && factor.field !== 'mm')
    const candidates = nbaMatrixCandidates(board, { defense: defense?.profiles, market, tracking: tracking?.rows, publicPicks: picks }).map(candidate => ({
      ...candidate,
      values: (factor: Parameters<typeof candidate.values>[0]) => !proven(candidate.id, factor) ? null : candidate.values(factor),
    }))
    const matches = matrices.map(matrix => {
      const rows = matrix.definition.factors ?? matrix.definition.steps ?? []
      const unproven = rows.some(factor => candidates.some(candidate => !seasonProven(candidate.id, factor)))
      if (unproven) unavailable.push('Some saved matrix factors are unavailable for the selected season')
      // Ranking a smaller population or treating an unknown unless-factor as
      // false can create a different historical result. Withhold that matrix.
      const unsafePipeline = matrix.matrix_type === 'pipeline' && nbaMatrixUnsafePipelineStep(matrix.definition.steps ?? [], candidates, proven)
      if (unsafePipeline) unavailable.push('Some matrix results are unavailable because a required input is missing')
      const ids = unsafePipeline ? new Set<string>() : evaluateNbaMatrix(matrix, candidates)
      return { id: matrix.id, name: matrix.name, color: matrix.color, playerIds: [...ids].map(Number),
        readings: candidates.filter(c => ids.has(c.id)).map(c => ({ playerId: Number(c.id), values: rows.map(f => ({ id: f.id, value: c.values(f) })) })),
        missing: candidates.reduce((total, c) => total + rows.filter(f => c.values(f) == null).length, 0),
        ...(unsafePipeline ? { unavailable: 'Required input unavailable' } : {}) }
    })
    const matchedIds = new Set(matches.flatMap(m => m.playerIds))
    const players = board.players.filter(p => matchedIds.has(p.id)).map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, gameId: board.game.id, team: p.team.abbreviation }))
    return NextResponse.json({ gameId: board.game.id, mode, matrices, matches, players, unavailable: [...new Set(unavailable)].sort(), fetchedAt: board.fetchedAt }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'NBA Matrix results could not refresh.' }, { status: 503 }) }
}
