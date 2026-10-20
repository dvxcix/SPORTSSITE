import 'server-only'
import type { ESPNGame, ESPNSummary } from '@slipsurge/core/espn-api'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PaintGame } from '@/lib/nbaPaint'

const canonical = (value: string) => ({ GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA' }[value.toUpperCase()] ?? value.toUpperCase())

/** Scoreboard IDs and research IDs are different namespaces; join by exact date and both teams. */
export async function nbaGameReference(summary: ESPNSummary | null, game: ESPNGame | null) {
  const competition = summary?.header?.competitions?.[0]
  const rawDate = (competition as { date?: string } | undefined)?.date ?? game?.date
  if (!rawDate || !Number.isFinite(Date.parse(rawDate))) return null
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(rawDate))
  const teams = competition?.competitors ?? game?.competitions?.[0]?.competitors ?? []
  const home = teams.find(team => team.homeAway === 'home')?.team.abbreviation
  const away = teams.find(team => team.homeAway === 'away')?.team.abbreviation
  if (!home || !away) return null
  const { data, error } = await createAdminClient().from('nba_games').select('payload').eq('game_date', date).limit(30).abortSignal(AbortSignal.timeout(6000))
  if (error) return null
  const matches = (data ?? []).map(row => row.payload as PaintGame).filter(row => row.date.slice(0,10) === date && canonical(row.home_team.abbreviation) === canonical(home) && canonical(row.visitor_team.abbreviation) === canonical(away))
  return matches.length === 1 ? { id: String(matches[0].id), date } : null
}
