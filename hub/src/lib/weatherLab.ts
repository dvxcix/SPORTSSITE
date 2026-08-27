import { getMLBSchedule, type MLBGame } from '@slipsurge/core/mlb-api'
import { MLB_PARKS, normalizeBearing, type ParkInfo, type ParkRoof } from '@slipsurge/core/mlbParks'

interface HourEntry {
  label: string
  tempF: number | null
  windMph: number | null
  windGustMph: number | null
  windDirDeg: number | null
  humidity: number | null
  weatherCode: number | null
  hour?: number
  isCurrent?: boolean
}

interface OpenMeteoPayload {
  timezone?: string
  current?: {
    time?: string
    temperature_2m?: number
    relative_humidity_2m?: number
    wind_speed_10m?: number
    wind_gusts_10m?: number
    wind_direction_10m?: number
    weather_code?: number
  }
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    relative_humidity_2m?: number[]
    wind_speed_10m?: number[]
    wind_gusts_10m?: number[]
    wind_direction_10m?: number[]
    weather_code?: number[]
  }
}

interface WeatherPayload {
  timezone: string
  current: HourEntry | null
  hourly: Map<string, HourEntry>
}

const WEATHER_REVALIDATE_SECONDS = 300

async function fetchWeather(lat: number, lon: number, dateISO: string): Promise<WeatherPayload> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code',
    hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
    start_date: dateISO,
    end_date: addDays(dateISO, 1),
  })
  const empty: WeatherPayload = { timezone: 'America/New_York', current: null, hourly: new Map() }

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      next: { revalidate: WEATHER_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return empty
    const data = await res.json() as OpenMeteoPayload
    const hourly = new Map<string, HourEntry>()
    const times = data.hourly?.time ?? []
    for (let i = 0; i < times.length; i++) {
      hourly.set(times[i], {
        label: '',
        tempF: data.hourly?.temperature_2m?.[i] ?? null,
        windMph: data.hourly?.wind_speed_10m?.[i] ?? null,
        windGustMph: data.hourly?.wind_gusts_10m?.[i] ?? null,
        windDirDeg: data.hourly?.wind_direction_10m?.[i] ?? null,
        humidity: data.hourly?.relative_humidity_2m?.[i] ?? null,
        weatherCode: data.hourly?.weather_code?.[i] ?? null,
      })
    }

    const current = data.current?.time ? {
      label: 'now',
      tempF: data.current.temperature_2m ?? null,
      windMph: data.current.wind_speed_10m ?? null,
      windGustMph: data.current.wind_gusts_10m ?? null,
      windDirDeg: data.current.wind_direction_10m ?? null,
      humidity: data.current.relative_humidity_2m ?? null,
      weatherCode: data.current.weather_code ?? null,
      isCurrent: true,
    } : null

    return { timezone: data.timezone || empty.timezone, current, hourly }
  } catch {
    return empty
  }
}

function hourLabel(hour: number) {
  const period = hour >= 12 ? 'pm' : 'am'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}${period}`
}

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')) % 24 }
}

function addDays(dateISO: string, days: number) {
  const date = new Date(`${dateISO}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function roofType(value?: string): ParkRoof | undefined {
  const normalized = value?.toLowerCase() ?? ''
  if (normalized.includes('retract')) return 'retractable'
  if (normalized.includes('dome') || normalized.includes('fixed')) return 'dome'
  if (normalized.includes('open')) return 'open'
  return undefined
}

function officialPark(game: MLBGame, fallback: ParkInfo): ParkInfo {
  const coordinates = game.venue?.location?.defaultCoordinates
  return {
    name: game.venue?.name || fallback.name,
    city: game.venue?.location?.city || fallback.city,
    lat: coordinates?.latitude ?? fallback.lat,
    lon: coordinates?.longitude ?? fallback.lon,
    roof: roofType(game.venue?.fieldInfo?.roofType) ?? fallback.roof,
    orientationDeg: normalizeBearing(game.venue?.location?.azimuthAngle ?? fallback.orientationDeg),
  }
}

function resolvedRoofStatus(park: ParkInfo, condition?: string) {
  if (park.roof === 'dome') return 'fixed' as const
  if (park.roof === 'open') return 'open' as const
  if (/roof closed/i.test(condition ?? '')) return 'closed' as const
  if (condition?.trim()) return 'open' as const
  return 'unknown' as const
}

export async function getWeatherLabData(date?: string) {
  const resolvedDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getMLBSchedule(resolvedDate)
  const fetchedAt = new Date().toISOString()

  const results = await Promise.all(games.map(async game => {
    const homeAbbr = game.teams.home.team.abbreviation
    const awayAbbr = game.teams.away.team.abbreviation
    const fallback = homeAbbr ? MLB_PARKS[homeAbbr.toUpperCase()] : undefined
    if (!fallback) return null

    const park = officialPark(game, fallback)
    const venueTimeZone = game.venue?.timeZone?.id || 'America/New_York'
    const gameTime = new Date(game.gameDate)
    const local = dateParts(gameTime, venueTimeZone)
    const weather = await fetchWeather(park.lat, park.lon, local.date)
    const hours: HourEntry[] = []
    const now = Date.now()
    const gameMs = gameTime.getTime()
    const showCurrent = local.date === dateParts(new Date(), weather.timezone).date
      && now >= gameMs - 30 * 60_000
      && now <= gameMs + 5 * 60 * 60_000

    if (showCurrent && weather.current) hours.push(weather.current)
    for (let i = 0; i < 4; i++) {
      const absoluteHour = local.hour + i
      const hour = absoluteHour % 24
      const keyDate = addDays(local.date, Math.floor(absoluteHour / 24))
      const entry = weather.hourly.get(`${keyDate}T${String(hour).padStart(2, '0')}:00`)
      if (entry) hours.push({ ...entry, label: hourLabel(hour), hour })
    }
    if (!hours.length) return null

    const roofStatus = resolvedRoofStatus(park, game.weather?.condition)
    return {
      gamePk: game.gamePk,
      gameDate: game.gameDate,
      homeAbbr: homeAbbr ?? '',
      awayAbbr: awayAbbr ?? '',
      homeTeam: game.teams.home.team.teamName ?? game.teams.home.team.name,
      awayTeam: game.teams.away.team.teamName ?? game.teams.away.team.name,
      park,
      hours,
      roofStatus,
      weatherMode: showCurrent && weather.current ? 'live' as const : 'forecast' as const,
      weatherUpdatedAt: fetchedAt,
      source: 'Open-Meteo',
    }
  }))

  return {
    date: resolvedDate,
    fetchedAt,
    refreshSeconds: WEATHER_REVALIDATE_SECONDS,
    games: results.filter((game): game is NonNullable<typeof game> => game != null),
  }
}
