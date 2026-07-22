'use client'

import { useEffect, useState } from 'react'
import { getTeamColor, getTeamSecondaryColor } from '@/lib/mlbTeamColors'
import { WMO_LABELS, compassFromTo, hrWindColor, hrWeatherScore } from '@/lib/mlbParks'
import { ParkShape, WindCanvas, type WeatherGame } from '@/components/weather/WeatherLabClient'
import { Tooltip } from '@/components/ui/tooltip-card'

// Same park-shape/wind-canvas rendering Weather Lab already ships, reused
// here rather than rebuilt — one game's card out of that page's own
// per-date fetch, cached per date since every batter row expanded for the
// same game asks for the same data.
const weatherCache = new Map<string, Promise<WeatherGame[]>>()
function fetchWeatherCached(date: string) {
  let p = weatherCache.get(date)
  if (!p) {
    p = fetch(`/api/weather-lab?date=${date}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => d.games ?? [])
      .catch(() => [])
    weatherCache.set(date, p)
  }
  return p
}

export function GameWeatherCard({ gamePk, date }: { gamePk: string; date: string }) {
  const [games, setGames] = useState<WeatherGame[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setGames(null)
    fetchWeatherCached(date).then(g => { if (!cancelled) setGames(g) })
    return () => { cancelled = true }
  }, [date])

  if (games === null) return null
  const game = games.find(g => String(g.gamePk) === String(gamePk))
  if (!game) return null

  const h = game.hours[0]
  const teamPrimary = getTeamColor(game.homeAbbr)
  const teamSecondary = getTeamSecondaryColor(game.homeAbbr)
  const isSheltered = game.park.roof !== 'open'
  const dirs = h?.windDirDeg != null ? compassFromTo(h.windDirDeg) : null
  const hrWeather = hrWeatherScore({
    tempF: h?.tempF ?? null,
    humidity: h?.humidity ?? null,
    windDirDeg: h?.windDirDeg ?? null,
    windMph: h?.windMph ?? null,
    orientationDeg: game.park.orientationDeg,
    sheltered: isSheltered,
  })
  const hrWeatherBg = hrWeather.color.startsWith('rgb')
    ? hrWeather.color.replace('rgb(', 'rgba(').replace(')', ',0.14)')
    : hrWeather.color

  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 6 }}>
        BALLPARK
      </div>

      <div style={{ position: 'relative', width: 150, aspectRatio: '1/1', margin: '0 auto' }}>
        <div style={isSheltered ? { position: 'absolute', inset: 0, filter: 'grayscale(1) brightness(0.55)' } : { position: 'absolute', inset: 0 }}>
          <ParkShape primary={teamPrimary} secondary={teamSecondary} teamAbbr={game.homeAbbr} />
        </div>
        {!isSheltered && (
          <WindCanvas
            deg={h?.windDirDeg ?? null}
            mph={h?.windMph ?? null}
            color={hrWindColor(h?.windDirDeg ?? null, h?.windMph ?? null, game.park.orientationDeg)}
          />
        )}
        {isSheltered && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#eab308' }}>
              {game.park.roof === 'dome' ? 'Fixed Roof' : 'Retractable Roof'}
            </span>
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{game.park.name}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 4 }}>
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>WIND</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{h?.windMph != null ? `${h.windMph.toFixed(1)} mph` : '—'}</div>
          <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{dirs ? `${dirs.from} to ${dirs.to}` : '—'}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>TEMP</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{h?.tempF != null ? `${Math.round(h.tempF)}°F` : '—'}</div>
          <div style={{ fontSize: 9, color: 'var(--text-3)', maxWidth: '11ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {h?.weatherCode != null ? WMO_LABELS[h.weatherCode] ?? '—' : '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>HUMIDITY</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{h?.humidity != null ? `${Math.round(h.humidity)}%` : '—'}</div>
        </div>
      </div>

      <Tooltip content={hrWeather.label}>
        <div style={{
          marginTop: 6, padding: '5px 8px', borderRadius: 8, textAlign: 'center', cursor: 'help',
          background: hrWeatherBg, border: `1px solid ${hrWeather.color}`,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>HR WEATHER </span>
          <span style={{ fontSize: 12, fontWeight: 900, color: hrWeather.color }}>
            {hrWeather.score > 0 ? '+' : ''}{hrWeather.score.toFixed(1)}
          </span>
        </div>
      </Tooltip>
    </div>
  )
}
