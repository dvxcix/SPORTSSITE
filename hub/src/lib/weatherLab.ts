import { getMLBSchedule } from '@/lib/mlb-api'
import { MLB_PARKS } from '@/lib/mlbParks'

interface HourEntry {
  label: string        // "1pm"
  tempF: number | null
  windMph: number | null
  windDirDeg: number | null
  humidity: number | null
  weatherCode: number | null
}

async function fetchHourly(lat: number, lon: number, dateISO: string): Promise<Map<string, HourEntry>> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York` +
    `&start_date=${dateISO}&end_date=${dateISO}`
  const map = new Map<string, HourEntry>()
  try {
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) return map
    const d = await res.json()
    const times: string[] = d.hourly?.time ?? []
    for (let i = 0; i < times.length; i++) {
      // times are "YYYY-MM-DDTHH:00" in America/New_York already
      map.set(times[i], {
        label: '',
        tempF: d.hourly.temperature_2m?.[i] ?? null,
        windMph: d.hourly.wind_speed_10m?.[i] ?? null,
        windDirDeg: d.hourly.wind_direction_10m?.[i] ?? null,
        humidity: d.hourly.relative_humidity_2m?.[i] ?? null,
        weatherCode: d.hourly.weather_code?.[i] ?? null,
      })
    }
  } catch {}
  return map
}

function hourLabel(h: number) {
  const period = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${period}`
}

// Shared by the /api/weather-lab route AND the /weather-lab server page —
// the page used to fetch its own API route over HTTP, but that outbound
// fetch doesn't carry the session cookie, so middleware treated it as
// unauthenticated and returned the login page's HTML instead of JSON,
// which crashed res.json(). Calling this directly from both call sites
// avoids the self-fetch (and the auth gap) entirely.
export async function getWeatherLabData(date?: string) {
  const resolvedDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getMLBSchedule(resolvedDate)

  // One weather fetch per unique park (several games can share none, but
  // no two games share a park on the same day in practice) — fetched in
  // parallel, not sequentially, since each is an independent outbound call.
  const results = await Promise.all(games.map(async (g) => {
    const homeAbbr = g.teams.home.team.abbreviation
    const awayAbbr = g.teams.away.team.abbreviation
    const park = homeAbbr ? MLB_PARKS[homeAbbr.toUpperCase()] : undefined
    if (!park) return null

    const gameDate = new Date(g.gameDate)
    // The ET wall-clock hour of first pitch — Open-Meteo's hourly rows are
    // keyed in America/New_York local time already (see &timezone= above).
    const etParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(gameDate)
    const get = (t: string) => etParts.find(p => p.type === t)?.value
    const yyyy = get('year'), mm = get('month'), dd = get('day')
    let hh = parseInt(get('hour') || '12', 10)
    if (hh === 24) hh = 0
    const dateStr = `${yyyy}-${mm}-${dd}`

    const hourly = await fetchHourly(park.lat, park.lon, dateStr)
    const hours: (HourEntry & { hour: number })[] = []
    for (let i = 0; i < 4; i++) {
      const h = hh + i
      const key = `${dateStr}T${String(h % 24).padStart(2, '0')}:00`
      const entry = hourly.get(key)
      if (entry) hours.push({ ...entry, label: hourLabel(h % 24), hour: h % 24 })
    }
    if (!hours.length) return null

    return {
      gamePk: g.gamePk,
      gameDate: g.gameDate,
      homeAbbr: homeAbbr ?? '',
      awayAbbr: awayAbbr ?? '',
      homeTeam: g.teams.home.team.teamName ?? g.teams.home.team.name,
      awayTeam: g.teams.away.team.teamName ?? g.teams.away.team.name,
      park,
      hours,
    }
  }))

  return { date: resolvedDate, games: results.filter((g): g is NonNullable<typeof g> => g != null) }
}
