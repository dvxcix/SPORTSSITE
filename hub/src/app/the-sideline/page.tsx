import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { SidelineClient, type SidelineGame } from './SidelineClient'
import { getSidelineLens } from './analysis'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Sideline - SlipSurge',
  description: 'Private NFL matchup and game-script laboratory.',
  robots: { index: false, follow: false, nocache: true },
}

const FALLBACK_GAMES: SidelineGame[] = [
  {
    id: 'sideline-preview',
    season: 2026,
    week: 1,
    gameType: 'PRE',
    gameday: '2026-08-22',
    gametime: '7:00 PM',
    stadium: 'Preseason Lab',
    roof: 'outdoors',
    surface: 'grass',
    away: { abbr: 'BUF', name: 'Buffalo Bills', color: '#00338D', logo: null },
    home: { abbr: 'NYG', name: 'New York Giants', color: '#0B2265', logo: null },
  },
]

async function getGames(): Promise<SidelineGame[]> {
  try {
    const admin = createAdminClient()
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const { data: schedule, error } = await admin
      .from('nfl_schedule')
      .select('game_id, season, game_type, week, gameday, gametime, away_team, home_team, stadium, roof, surface')
      .gte('gameday', today)
      .order('gameday', { ascending: true })
      .order('gametime', { ascending: true })
      .limit(24)

    if (error || !schedule?.length) return FALLBACK_GAMES

    const abbreviations = Array.from(new Set(schedule.flatMap(game => [game.away_team, game.home_team]).filter(Boolean)))
    const { data: teams } = await admin
      .from('nfl_teams')
      .select('team_abbr, team_name, team_color, team_logo_espn')
      .in('team_abbr', abbreviations)

    const teamByAbbr = new Map((teams ?? []).map(team => [team.team_abbr, team]))
    const team = (abbr: string) => {
      const found = teamByAbbr.get(abbr)
      return {
        abbr,
        name: found?.team_name ?? abbr,
        color: found?.team_color ?? '#1b2430',
        logo: found?.team_logo_espn ?? null,
      }
    }

    return schedule.map(game => ({
      id: game.game_id,
      season: game.season,
      week: game.week,
      gameType: game.game_type,
      gameday: game.gameday,
      gametime: game.gametime,
      stadium: game.stadium,
      roof: game.roof,
      surface: game.surface,
      away: team(game.away_team),
      home: team(game.home_team),
    }))
  } catch {
    return FALLBACK_GAMES
  }
}

export default async function SidelinePage({ searchParams }: { searchParams: Promise<{ game?: string | string[] }> }) {
  const games = await getGames()
  const params = await searchParams
  const requestedGame = Array.isArray(params.game) ? params.game[0] : params.game
  const selected = games.find(game => game.id === requestedGame) ?? games[0]
  const lens = await getSidelineLens(selected)
  return <SidelineClient games={games} selectedId={selected.id} lens={lens} />
}
