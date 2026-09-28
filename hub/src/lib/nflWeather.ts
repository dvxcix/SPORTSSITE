import type { SidelineGame } from '@/app/the-sideline/types'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import { NFL_WEATHER_VENUES } from './nflWeatherVenues'

type WeatherGame = Pick<SidelineGame, 'stadium' | 'roof' | 'surface' | 'gameday' | 'gametime' | 'temp' | 'wind'>
type Period = { startTime?: string; endTime?: string; temperature?: number; temperatureUnit?: string; windSpeed?: string; windDirection?: string; shortForecast?: string }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const aliases: Record<string,string> = {
  'NRG Stadium':'Reliant Stadium', 'Arrowhead Stadium':'GEHA Field at Arrowhead Stadium',
  'FirstEnergy Stadium':'Huntington Bank Field', 'Cleveland Browns Stadium':'Huntington Bank Field',
  'FedExField':'Northwest Stadium', 'Heinz Field':'Acrisure Stadium', 'Paul Brown Stadium':'Paycor Stadium',
  'TIAA Bank Field':'EverBank Stadium', 'Mercedes-Benz Superdome':'Caesars Superdome',
}
export function periodWeather(periods: Period[], at: Date): string | null {
  const period = periods.find(p => Date.parse(p.startTime ?? '') <= at.getTime() && Date.parse(p.endTime ?? '') > at.getTime())
  if (!period || !finite(period.temperature)) return null
  if (!['F','C'].includes(period.temperatureUnit ?? '')) return null
  const temp = period.temperatureUnit === 'C' ? period.temperature * 9 / 5 + 32 : period.temperature
  return [Math.round(temp) + '°F', period.shortForecast,
    period.windSpeed ? 'Wind ' + [period.windDirection, period.windSpeed].filter(Boolean).join(' ') : null,
  ].filter(Boolean).join(' · ')
}

export async function loadNflWeather(game: WeatherGame, fetcher: typeof fetch = fetch, now = new Date()): Promise<string> {
  const roof = (game.roof ?? '').toLowerCase()
  const indoor = ['dome','closed','indoors','indoor'].includes(roof)
  const context = [indoor ? 'Indoors' : game.roof, game.surface].filter(Boolean).join(' · ')
  if (indoor) return context
  const stored = [finite(game.temp) ? game.temp + '°F' : null, finite(game.wind) ? game.wind + ' mph wind' : null].filter(Boolean)
  const finish = (text: string) => [text, context].filter(Boolean).join(' · ')
  const kickoff = nflKickoffAt(game)
  if (stored.length === 2) return finish(stored.join(' · '))
  const past = game.gameday < now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  if (past) return finish(stored.length ? stored.join(' · ') : 'Historical weather unavailable')
  if (!kickoff) return finish(stored.length ? stored.join(' · ') : 'Weather available once kickoff is confirmed')
  if (now.getTime() > kickoff.getTime() + 6 * 3600000) return finish(stored.length ? stored.join(' · ') : 'Historical weather unavailable')
  if (kickoff.getTime() - now.getTime() > 7 * 86400000) return finish('Forecast available closer to kickoff')
  const venue = NFL_WEATHER_VENUES[aliases[game.stadium ?? ''] ?? game.stadium ?? '']
  if (!venue) return finish(stored.length ? stored.join(' · ') : 'Weather unavailable for this venue')
  const get = async (url: string, seconds: number) => {
    if (new URL(url).origin !== 'https://api.weather.gov') throw new Error('Unexpected weather host')
    const res = await fetcher(url, { headers: { 'User-Agent': 'SlipSurge (https://www.slipsurge.com)', Accept: 'application/geo+json' }, next: { revalidate: seconds }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error('Weather status ' + res.status)
    return res.json()
  }
  try {
    const point = await get('https://api.weather.gov/points/' + venue.join(','), 86400)
    if (!point.properties?.forecastHourly) throw new Error('Missing forecast location')
    const hourly = await get(point.properties.forecastHourly, 900)
    const target = kickoff.getTime() > now.getTime() ? kickoff : now
    const weather = periodWeather(hourly.properties?.periods ?? [], target)
    if (weather) return finish((target === kickoff ? 'Kickoff forecast: ' : 'Game-time forecast: ') + weather)
  } catch (error) {
    console.warn('[nfl-weather] forecast unavailable', game.stadium, error instanceof Error ? error.message : 'request failed')
  }
  return finish(stored.length ? stored.join(' · ') : 'Forecast temporarily unavailable')
}
