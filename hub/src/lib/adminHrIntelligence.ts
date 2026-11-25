import 'server-only'
import { NextResponse } from 'next/server'
import { getTeamLogoPngUrl } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { buildHrIntelligenceSlate } from '@/lib/hrIntelligenceData'
import { HR_INTEL_MARKET_LABELS, HR_INTEL_PICK_LABELS } from '@/lib/hrIntelligenceLabels'
import { sportTeamColors } from '@/lib/sportTeamArtwork'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function playerArtwork(player: { mlbId: number; team: string }) {
  return {
    headshot: mlbHeadshot(player.mlbId),
    teamLogo: getTeamLogoPngUrl(player.team) ?? null,
    teamColors: sportTeamColors('mlb', player.team),
  }
}

export async function readHrIntelligence(request: Request, native = false) {
  const url = new URL(request.url)
  const date = url.searchParams.get('date') ?? ''
  const rawGamePk = url.searchParams.get('gamePk')
  const gamePk = rawGamePk == null ? undefined : Number(rawGamePk)
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Pass date as YYYY-MM-DD.' }, { status: 400 })
  }
  if (rawGamePk != null && (!Number.isInteger(gamePk) || Number(gamePk) <= 0)) {
    return NextResponse.json({ error: 'gamePk must be a positive integer.' }, { status: 400 })
  }

  try {
    const result = await buildHrIntelligenceSlate(date, gamePk)
    if (gamePk != null && result.games.length === 0) {
      return NextResponse.json({ error: 'That game was not found on the selected slate.' }, { status: 404 })
    }
    const incompleteExposureGames = result.games.filter(game =>
      game.diagnostics.picksCoveragePct < 80 || game.diagnostics.crossMarketPicksCoveragePct < 70,
    )
    if (!result.diagnostics.pikkitRowsPresent || incompleteExposureGames.length > 0) {
      const affectedGames = incompleteExposureGames.map(game => game.gameKey).join(', ')
      console.error('[hr-intelligence] required Pikkit exposure unavailable', {
        date,
        gamePk: gamePk ?? null,
        affectedGames,
      })
      return NextResponse.json({
        error: affectedGames
          ? `Analysis stopped because public exposure is incomplete for ${affectedGames}. No ranking was produced.`
          : 'Analysis stopped because public exposure is unavailable. No ranking was produced.',
      }, { status: 503 })
    }
    const output = native ? {
      ...result,
      marketLabels: HR_INTEL_MARKET_LABELS,
      pickLabels: HR_INTEL_PICK_LABELS,
      games: result.games.map(game => ({
        ...game,
        homeLogo: getTeamLogoPngUrl(game.homeTeam) ?? null,
        awayLogo: getTeamLogoPngUrl(game.awayTeam) ?? null,
        players: game.players.map(player => ({ ...player, ...playerArtwork(player) })),
        validation: game.validation ? {
          ...game.validation,
          realizedHrOutcomes: game.validation.realizedHrOutcomes.map(outcome => ({ ...outcome, ...playerArtwork(outcome) })),
        } : null,
      })),
    } : result
    return NextResponse.json(output, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (error) {
    console.error('[hr-intelligence] analysis failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Analysis failed.' }, { status: 500 })
  }
}
