import { NextResponse } from 'next/server'
import { hasTierAccess } from '@slipsurge/core/tiers'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoPngUrl, MLB_TEAM_COLORS, MLB_TEAM_SECONDARY_COLORS } from '@slipsurge/core/mlbTeamColors'
import { MLB_PARK_SHAPES } from '@slipsurge/core/mlbParkShapes'
import { compassFromTo, hrWeatherScore, windFieldLabel, windRelativeToField, WMO_LABELS } from '@slipsurge/core/mlbParks'
import { getDailyContactRecap } from '@/lib/dailyContactRecap'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { loadParkHomeRunHistory } from '@/lib/parkHrHistory'
import { getEffectiveTier } from '@/lib/requireTier'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { getWeatherLabData } from '@/lib/weatherLab'

export const revalidate = 0
export const maxDuration = 60

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (value: unknown, status = 200) => NextResponse.json(value, { status, headers })
const art = (code: string, name: string, score?: number | null) => ({
  code, name, score, logo: getTeamLogoPngUrl(code), primary: MLB_TEAM_COLORS[code], secondary: MLB_TEAM_SECONDARY_COLORS[code],
})

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  if (!await canViewMlb(account.supabase, account.userId)) return respond({ error: 'MLB research is unavailable for this account' }, 403)
  const query = new URL(request.url).searchParams
  const tool = query.get('tool')
  if (tool !== 'weather' && tool !== 'spray' && tool !== 'park-hr') return respond({ error: 'Unknown MLB tool' }, 400)
  const gate = await getEffectiveTier()
  if (gate.error) return gate.error
  if (gate.userId !== account.userId || !gate.tier) return respond({ error: 'Sign in required' }, 401)
  if (!hasTierAccess(gate.tier, tool === 'spray' ? 'ultimate' : 'basic')) return respond({ error: 'Upgrade required' }, 403)

  try {
    if (tool === 'park-hr') {
      const id = query.get('gamePk') ?? ''
      if (!/^\d{1,10}$/.test(id) || Number(id) <= 0) return respond({ error: 'Choose a valid game' }, 400)
      const result = await loadParkHomeRunHistory(id)
      const teams = [art(result.awayAbbr, result.awayTeam), art(result.homeAbbr, result.homeTeam)]
      return respond({ confirmed: result.confirmed, season: result.season, teams,
        batters: result.batters.map(batter => ({ ...batter, headshot: mlbHeadshot(batter.mlbId) })) })
    }
    const date = query.get('date') ?? ''
    const day = new Date(`${date}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== date) {
      return respond({ error: 'Choose a valid slate date' }, 400)
    }
    if (tool === 'weather') {
      const data = await getWeatherLabData(date)
      return respond({ date: data.date, fetchedAt: data.fetchedAt, refreshSeconds: data.refreshSeconds, games: data.games.map(game => {
        const sheltered = game.roofStatus === 'closed' || game.roofStatus === 'fixed'
        const { park } = game
        return {
          id: game.gamePk, startsAt: game.gameDate, away: art(game.awayAbbr, game.awayTeam), home: art(game.homeAbbr, game.homeTeam),
          park: park.name, city: park.city, shape: MLB_PARK_SHAPES[game.homeAbbr] ?? null, roofStatus: game.roofStatus, source: game.source,
          hours: game.hours.map(hour => ({
            ...hour, conditions: hour.weatherCode == null ? null : WMO_LABELS[hour.weatherCode] ?? null,
            compass: hour.windDirDeg == null ? null : compassFromTo(hour.windDirDeg),
            windField: sheltered ? null : windFieldLabel(hour.windDirDeg, park.orientationDeg),
            windAngle: sheltered || hour.windDirDeg == null ? null : windRelativeToField(hour.windDirDeg, park.orientationDeg),
            carry: hrWeatherScore({ ...hour, orientationDeg: park.orientationDeg, sheltered }),
          })),
        }
      }) })
    }
    const data = await getDailyContactRecap(date)
    const games = data.games.map(game => ({
      id: game.gamePk, venue: game.venueName, status: game.status, away: art(game.awayTeam, game.awayName, game.awayScore),
      home: art(game.homeTeam, game.homeName, game.homeScore), shape: MLB_PARK_SHAPES[game.parkTeamAbbr] ?? null,
    }))
    return respond({
      date: data.date, generatedAt: data.generatedAt, games, notes: data.dataNotes,
      contacts: data.contacts.map(({ game: _game, ...event }) => ({ ...event, headshot: mlbHeadshot(event.batterId) })),
    })
  } catch {
    return respond({ error: 'MLB research could not be loaded. Try again.' }, 503)
  }
}
