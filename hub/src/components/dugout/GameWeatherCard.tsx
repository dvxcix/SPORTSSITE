'use client'

import { useEffect, useState } from 'react'
import { getTeamColor, getTeamSecondaryColor, getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { WMO_LABELS, compassFromTo, hrWindColor, hrWeatherScore } from '@slipsurge/core/mlbParks'
import { ParkShape, WindCanvas, WIND_CANVAS_SIZE, hexToRgba, type WeatherGame } from '@/components/weather/WeatherLabClient'
import { Tooltip } from '@/components/ui/tooltip-card'
import { BattedBallSprayChart, type SprayPitchRow } from '@/components/players/BattedBallSprayChart'

// Same park-shape/wind-canvas rendering Weather Lab already ships, reused
// here rather than rebuilt — one game's card out of that page's own
// per-date fetch, cached per date since every batter row expanded for the
// same game asks for the same data.
const weatherCache = new Map<string, Promise<WeatherGame[]>>()
export function fetchWeatherCached(date: string) {
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

export function GameWeatherSummary({ gamePk, date, venue }: { gamePk: string; date: string; venue?: string | null }) {
  const [games, setGames] = useState<WeatherGame[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchWeatherCached(date).then(value => { if (!cancelled) setGames(value) })
    return () => { cancelled = true }
  }, [date])

  const game = games?.find(item => String(item.gamePk) === String(gamePk))
  const hour = game?.hours?.[0]
  const sheltered = game ? game.park.roof !== 'open' : false
  const directions = hour?.windDirDeg != null ? compassFromTo(hour.windDirDeg) : null
  const conditions = sheltered
    ? game?.park.roof === 'dome' ? 'Fixed roof' : 'Roof protected'
    : hour?.windMph != null ? `${Math.round(hour.windMph)} mph${directions ? ` to ${directions.to}` : ''}` : 'Weather pending'
  const temperature = hour?.tempF != null ? `${Math.round(hour.tempF)}°F` : null

  return (
    <span className="dugout-weather-summary" data-tone="weather">
      <small>BALLPARK CONDITIONS</small>
      <strong>{game?.park.name || venue || 'Ballpark pending'}</strong>
      <em>{[temperature, conditions].filter(Boolean).join(' · ')}</em>
    </span>
  )
}

export function GameWeatherCard({
  gamePk,
  date,
  sprayRows = [],
  playerName = 'Batter',
  selectionLabel = 'All visible contact',
}: {
  gamePk: string
  date: string
  sprayRows?: SprayPitchRow[]
  playerName?: string
  selectionLabel?: string
}) {
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
  const logoUrl = getTeamLogoUrl(game.homeAbbr)
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
    <section className="dugout-park-card" style={{ ['--park-primary' as string]: teamPrimary, ['--park-secondary' as string]: teamSecondary }}>
      <header className="dugout-park-card-head">
        <span>PARK PROJECTION</span>
        <strong>{game.park.name}</strong>
        <small>{sprayRows.length ? selectionLabel : `${game.homeAbbr} field conditions`}</small>
      </header>
      <div className="dugout-park-visual">
      {sprayRows.length > 0 ? (
        <BattedBallSprayChart
          rows={sprayRows}
          playerName={playerName}
          compact
          projection={{ teamAbbr: game.homeAbbr, parkName: game.park.name, contextLabel: selectionLabel }}
          fieldOverlay={!isSheltered ? (
            <WindCanvas
              deg={h?.windDirDeg ?? null}
              mph={h?.windMph ?? null}
              color={hrWindColor(h?.windDirDeg ?? null, h?.windMph ?? null, game.park.orientationDeg)}
            />
          ) : undefined}
        />
      ) : (
      <>
      {/* WindCanvas always draws at a fixed WIND_CANVAS_SIZE px regardless of
          its container - sizing this wrapper to that same constant (not an
          arbitrary smaller box) is what keeps the wind streaks inside the
          park outline instead of overflowing it. */}
      <div className="dugout-park-canvas" style={{ position: 'relative', width: WIND_CANVAS_SIZE, height: WIND_CANVAS_SIZE, margin: '0 auto' }}>
        <div style={isSheltered ? { position: 'absolute', inset: 0, filter: 'grayscale(1) brightness(0.55)' } : { position: 'absolute', inset: 0 }}>
          <ParkShape primary={teamPrimary} secondary={teamSecondary} teamAbbr={game.homeAbbr} />
          {logoUrl && (
            <img src={logoUrl} alt="" style={{
              position: 'absolute', top: '34%', left: '50%', transform: 'translate(-50%,-50%)',
              width: '18%', opacity: 0.95, pointerEvents: 'none',
              filter: `drop-shadow(0 0 2.5px ${hexToRgba(teamSecondary, 0.75)}) drop-shadow(0 0 2.5px ${hexToRgba(teamSecondary, 0.75)})`,
            }} />
          )}
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
      </>
      )}
      </div>

      <div className="dugout-weather-metrics" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 4 }}>
        <div className="is-wind">
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>WIND</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{h?.windMph != null ? `${h.windMph.toFixed(1)} mph` : '—'}</div>
          <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{dirs ? `${dirs.from} to ${dirs.to}` : '—'}</div>
        </div>
        <div className="is-temp" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>TEMP</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{h?.tempF != null ? `${Math.round(h.tempF)}°F` : '—'}</div>
          <div style={{ fontSize: 9, color: 'var(--text-3)', maxWidth: '11ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {h?.weatherCode != null ? WMO_LABELS[h.weatherCode] ?? '—' : '—'}
          </div>
        </div>
        <div className="is-humidity" style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>HUMIDITY</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{h?.humidity != null ? `${Math.round(h.humidity)}%` : '—'}</div>
        </div>
      </div>

      <Tooltip content={hrWeather.label}>
        <div className="dugout-weather-score" style={{
          marginTop: 6, padding: '5px 8px', borderRadius: 8, textAlign: 'center', cursor: 'help',
          background: hrWeatherBg, border: `1px solid ${hrWeather.color}`,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>HR WEATHER </span>
          <span style={{ fontSize: 12, fontWeight: 900, color: hrWeather.color }}>
            {hrWeather.score > 0 ? '+' : ''}{hrWeather.score.toFixed(1)}
          </span>
        </div>
      </Tooltip>
      <style jsx>{`
        .dugout-park-card{width:100%;min-width:0;overflow:hidden;border:1px solid rgba(148,163,184,.24);border-radius:16px;background:linear-gradient(155deg,#0b1420 0%,#071019 52%,#090f17 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 18px 46px rgba(0,0,0,.28);color:#f8fafc}
        .dugout-park-card-head{display:grid;grid-template-columns:1fr auto;gap:3px 12px;padding:13px 14px;border-bottom:1px solid rgba(148,163,184,.18);background:linear-gradient(90deg,color-mix(in srgb,var(--park-primary) 20%,#0b1420),#0b1420 72%)}
        .dugout-park-card-head span{grid-column:1;color:#b4ff4d;font-size:9px;font-weight:950;letter-spacing:.12em}
        .dugout-park-card-head strong{grid-column:1;overflow:hidden;color:#f8fafc;font-size:14px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
        .dugout-park-card-head small{grid-column:2;grid-row:1/3;align-self:center;max-width:170px;overflow:hidden;color:#cbd5e1;font-size:9px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}
        .dugout-park-visual{position:relative;display:grid;place-items:center;min-height:232px;overflow:hidden;padding:10px;background:radial-gradient(circle at 50% 42%,color-mix(in srgb,var(--park-primary) 20%,transparent),transparent 58%),linear-gradient(180deg,rgba(15,23,42,.7),rgba(2,6,23,.86))}
        .dugout-park-canvas{max-width:100%;transform-origin:center}
        .dugout-weather-metrics{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px!important;margin:0!important;padding:10px 10px 0}
        .dugout-weather-metrics>div{min-width:0;padding:9px 10px;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(15,23,42,.72);text-align:left!important}
        .dugout-weather-metrics>div>div:first-child{color:#94a3b8!important;font-size:8px!important;font-weight:950!important;letter-spacing:.1em!important}
        .dugout-weather-metrics>div>div:nth-child(2){margin-top:3px;color:#f8fafc!important;font-size:14px!important;font-weight:900!important}
        .dugout-weather-metrics>div>div:nth-child(3){margin-top:2px;color:#cbd5e1!important;font-size:9px!important}
        .dugout-weather-score{display:flex;align-items:center;justify-content:center;gap:7px;margin:8px 10px 10px!important;min-height:42px;padding:7px 10px!important;border-radius:10px!important;background:rgba(15,23,42,.82)!important}
        .dugout-weather-score span:first-child{color:#cbd5e1!important;font-size:9px!important;font-weight:950!important;letter-spacing:.08em!important}
        @media(max-width:640px){.dugout-park-card{border-radius:13px}.dugout-park-card-head{grid-template-columns:minmax(0,1fr);padding:11px 12px}.dugout-park-card-head small{grid-column:1;grid-row:auto;max-width:none}.dugout-park-visual{min-height:205px;padding:6px}.dugout-park-canvas{transform:scale(.9)}.dugout-weather-metrics{gap:5px!important;padding:8px 8px 0}.dugout-weather-metrics>div{padding:8px 7px}.dugout-weather-metrics>div>div:nth-child(2){font-size:12px!important}.dugout-weather-score{margin:7px 8px 8px!important}}
      `}</style>
    </section>
  )
}
