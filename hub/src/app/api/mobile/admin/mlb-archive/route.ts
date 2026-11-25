import { NextResponse } from 'next/server'
import { getTeamLogoPngUrl } from '@slipsurge/core/mlbTeamColors'
import { loadMlbArchive } from '@/lib/mlbArchiveReader'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  if (!request.headers.has('authorization')) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const query = new URL(request.url).searchParams
  try {
    const { date, latestDate, games, selected, cutoff, frames, current, research, quotes, researchDisplay } = await loadMlbArchive(actor.admin, {
      date: query.get('date') ?? undefined, game: query.get('game') ?? undefined, frame: query.get('frame') ?? undefined,
    })
    return NextResponse.json({ date, latestDate, cutoff,
      games: games.map(game => ({ id: game.game_pk, home: game.home_abbr, away: game.away_abbr,
        homeLogo: game.home_abbr ? getTeamLogoPngUrl(game.home_abbr) ?? null : null,
        awayLogo: game.away_abbr ? getTeamLogoPngUrl(game.away_abbr) ?? null : null,
      })),
      selectedGame: selected?.game_pk ?? null, selectedFrame: current?.id ?? null,
      frames: frames.map(frame => ({ id: frame.id, capturedAt: frame.captured_at })),
      quotes,
      research: research ? { observedAt: research.observed_at, source: research.source, content: researchDisplay || null } : null,
    }, { headers })
  } catch {
    return NextResponse.json({ error: 'Saved MLB archive couldn’t load' }, { status: 503, headers })
  }
}
