'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getTeamLogoUrl, getTeamColor, getTeamSecondaryColor, isDarkTeamLogo, LOGO_WHITE_FILTER } from '@/lib/mlbTeamColors'
import { WMO_LABELS, compassFromTo, hrWindColor, hrWeatherScore, type ParkRoof } from '@/lib/mlbParks'
import { MLB_PARK_SHAPES } from '@/lib/mlbParkShapes'
import { mlbHeadshot } from '@/lib/mlb-api'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { Tooltip } from '@/components/ui/tooltip-card'

// For the logo halo — a plain white glow read as flat/ugly against several
// teams' colors, so the halo uses that team's own secondary color instead.
// drop-shadow doesn't take a separate alpha param, so hex needs converting
// to rgba to control the glow's strength; anything already non-hex (the
// 'var(--surface-3)' fallback for an unmapped team) is used as-is.
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

interface HourEntry {
  label: string
  hour: number
  tempF: number | null
  windMph: number | null
  windDirDeg: number | null
  humidity: number | null
  weatherCode: number | null
}

interface WeatherGame {
  gamePk: number
  gameDate: string
  homeAbbr: string
  awayAbbr: string
  homeTeam: string
  awayTeam: string
  park: { name: string; city: string; roof: ParkRoof; orientationDeg: number }
  hours: HourEntry[]
}

// The pitcher's mound/rubber, foul lines, bases, and home plate — every one
// of the 30 realsports.io source diagrams draws these at the exact same
// standard coordinates regardless of park (it's a shared template, only the
// outfield/infield-dirt outlines actually differ per stadium), and always
// in the plain untransformed 0-250 space even for parks whose outfield path
// uses a matrix transform (CIN, NYM, SD). Two of the 30 source files
// happened to bake the home-plate marker directly into their infield_sand
// path instead of keeping it as this separate group (Arizona, Houston),
// which is why only those two showed a plate/bases detail before this was
// added uniformly — not an intentional per-park choice, just inconsistent
// source markup. Rendering it once, universally, fixes that for every park.
// The small sand-diamond patch immediately around home plate/the mound —
// MIA/DET/MIN/CWS's source diagrams happened to use this exact shape as
// their "infield_sand" path, while other parks (PIT, NYM, TB, BAL, etc.)
// got a large custom trace of that park's real infield-grass boundary
// instead. Rendered here as one fixed, standard-coordinate shape (same
// space as the bases/mound below) so every park gets the same recognizable
// sand patch regardless of what that park's own infield path looked like —
// consistency over per-park authenticity, since that's what reads clearly
// at this size.
const SAND_DIAMOND = 'M163.9,166.7l-1-1c-5-16-20-27.7-37.7-27.7s-32.7,11.7-37.7,27.7l-1,1l32.7,32.7c-0.5,0.9-0.7,1.9-0.7,3c0,3.7,3,6.7,6.7,6.7s6.7-3,6.7-6.7c0-1.1-0.3-2.1-0.7-3L163.9,166.7z M122.5,154.7c0.8,0.5,1.7,0.8,2.7,0.8s1.9-0.3,2.7-0.8l16.8,16.8c-1.6,1.6-1.6,4.1,0,5.6l2.5,2.5l-17.7,17.7c-1.2-1-2.7-1.6-4.3-1.6s-3.2,0.6-4.3,1.6l-17.7-17.7l2.5-2.5c1.6-1.5,1.6-4,0-5.6L122.5,154.7z'

// The pitcher's mound/rubber, foul lines, bases, and home plate — every one
// of the 30 realsports.io source diagrams draws these at the exact same
// standard coordinates regardless of park (it's a shared template, only the
// outfield outline actually differs per stadium), and always in the plain
// untransformed 0-250 space even for parks whose outfield path uses a
// matrix transform (CIN, NYM, SD). Two of the 30 source files happened to
// bake the home-plate marker directly into their infield_sand path instead
// of keeping it as this separate group (Arizona, Houston), which is why
// only those two showed a plate/bases detail before this was added
// uniformly — not an intentional per-park choice, just inconsistent source
// markup. Rendering it once, universally, fixes that for every park.
function InfieldDetail({ secondary }: { secondary: string }) {
  return (
    <>
      <path d={SAND_DIAMOND} fill={secondary} fillOpacity={0.8} stroke={secondary} strokeOpacity={1} strokeWidth={0.75} />
      <g fill="none" stroke="#fff" strokeWidth={0.75} opacity={0.85}>
        <path d="M122.5,174.7c-1.5,1.5-1.5,3.9,0,5.4s3.9,1.5,5.4,0c1.5-1.5,1.5-3.9,0-5.4C126.5,173.2,124,173.2,122.5,174.7z" fill="#fff" />
        <path d="M123.2,176.6h4v1.6h-4V176.6z" fill="#fff" />
        <path d="M125.2,203.2l-97.1-97.1" />
        <path d="M125.2,203.2l97.1-97.2" />
        <rect x="99.2" y="175.1" width="3" height="3" transform="matrix(0.7073 -0.7069 0.7069 0.7073 -95.3473 122.8833)" fill="#fff" />
        <rect x="148.1" y="175.2" width="3" height="3" transform="matrix(0.7073 -0.7069 0.7069 0.7073 -81.1078 157.4629)" fill="#fff" />
        <rect x="123.7" y="148.6" width="3" height="3" transform="matrix(0.707 -0.7073 0.7073 0.707 -69.4796 132.5406)" fill="#fff" />
        <polygon points="126.7,201.8 125.2,203.4 123.7,201.8 123.7,200.3 126.7,200.3" fill="#fff" />
      </g>
    </>
  )
}

// Real traced park outline when we have one for this team (see
// mlbParkShapes.ts); otherwise a generic "fan" shape — home plate at the
// bottom point opening out toward the outfield — so the page still reads
// as a ballpark and gives the wind arrow something to sit inside for teams
// we haven't traced yet. Two-tone: outfield in the home team's primary
// color, sand diamond in their secondary — a lot more distinctive per-card
// than every park sharing one site-wide accent color.
function ParkShape({ primary, secondary, teamAbbr }: { primary: string; secondary: string; teamAbbr: string }) {
  const real = MLB_PARK_SHAPES[teamAbbr.toUpperCase()]

  if (real) {
    return (
      <svg viewBox={real.viewBox} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <g transform={real.transform}>
          <path d={real.outfield} fill={primary} fillOpacity={0.32} stroke={primary} strokeOpacity={0.75} strokeWidth={1.5} />
        </g>
        <InfieldDetail secondary={secondary} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 250 250" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <path
        d="M125 220 L60 150 A 95 95 0 0 1 190 150 Z"
        fill={primary}
        fillOpacity={0.32}
        stroke={primary}
        strokeOpacity={0.75}
        strokeWidth={1.5}
      />
      <InfieldDetail secondary={secondary} />
    </svg>
  )
}

// A canvas-driven field of thin streak particles flowing across the park in
// the wind direction — closer to how weather-map sites (e.g. Ventusky)
// render wind than a handful of discrete arrow icons, which read as
// twinkling rather than moving air. requestAnimationFrame + canvas lets
// each particle be a genuine short line trail rather than a rotating glyph,
// and speed scales directly off real wind mph so a 2mph breeze crawls while
// a 15mph gust visibly streaks.
const WIND_CANVAS_SIZE = 220

function WindCanvas({ deg, mph, color }: { deg: number | null; mph: number | null; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (deg == null) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const size = WIND_CANVAS_SIZE
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)

    // Meteorological deg is where wind blows FROM — flip 180° for the
    // direction it actually travels, then convert to a screen vector
    // (0° = up, clockwise), matching the compass "N" marker below.
    const rad = (deg + 180) * Math.PI / 180
    const dx = Math.sin(rad)
    const dy = -Math.cos(rad)
    // Dialed down twice now — /15 still read as too fast relative to real
    // wind. /24 with a lower ceiling and floor compresses the whole range
    // further: single-digit mph reads as a near-still park, and even a
    // strong 20+mph gust is a noticeable-but-gentle drift, not a sprint.
    const speed = Math.min(0.85, Math.max(0.1, (mph ?? 5) / 24))
    const streakLen = 4 + speed * 6

    const radius = size / 2
    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * size,
      y: Math.random() * size,
    }))

    let raf = 0
    const tick = () => {
      ctx.clearRect(0, 0, size, size)
      ctx.save()
      ctx.beginPath()
      ctx.arc(radius, radius, radius, 0, Math.PI * 2)
      ctx.clip()
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.lineCap = 'round'
      ctx.globalAlpha = 0.4
      for (const p of particles) {
        p.x += dx * speed
        p.y += dy * speed
        const cx = p.x - radius, cy = p.y - radius
        if (cx * cx + cy * cy > radius * radius) {
          // re-enter from the upwind edge with some scatter, not a single point
          p.x = radius - dx * radius + (Math.random() - 0.5) * size
          p.y = radius - dy * radius + (Math.random() - 0.5) * size
        }
        ctx.beginPath()
        ctx.moveTo(p.x - dx * streakLen, p.y - dy * streakLen)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
      ctx.restore()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [deg, mph, color])

  if (deg == null) return null
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', fontSize: 8, fontWeight: 900, color: '#f87171' }}>N</div>
    </div>
  )
}

interface ParkHrBatter {
  mlbId: number
  name: string
  team: string
  position: string
  career: number
  season: number
}

interface ParkHrData {
  confirmed: boolean
  homeTeam: string
  awayTeam: string
  homeAbbr: string
  awayAbbr: string
  season: number
  batters: ParkHrBatter[]
}

// Who on BOTH tonight's rosters has actually gone deep at THIS park —
// career (since 2015, the Statcast era — see hrWindColor's own caveat
// about pre-2015 data not being available) and this season specifically.
// Confirmed lineup when it's posted, otherwise falls back to full active
// roster position players (same confirmed/projected pattern as the Dugout).
function ParkHrModal({ game, onClose }: { game: WeatherGame; onClose: () => void }) {
  const [data, setData] = useState<ParkHrData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(false)
    fetch(`/api/weather-lab/park-hr?gamePk=${game.gamePk}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [game.gamePk])

  const withHrs = data?.batters.filter(b => b.career > 0) ?? []
  const withoutHrs = data?.batters.filter(b => b.career === 0) ?? []
  // Dugout's date strip/data fetch keys off the ET calendar date, same as
  // everywhere else in the app that bridges a UTC game timestamp to it.
  const dugoutDate = new Date(game.gameDate).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {getTeamLogoUrl(game.awayAbbr) && (
                <img src={getTeamLogoUrl(game.awayAbbr)} alt={game.awayAbbr} style={{
                  width: 26, height: 26, objectFit: 'contain',
                  filter: isDarkTeamLogo(game.awayAbbr) ? LOGO_WHITE_FILTER : undefined,
                }} />
              )}
              <span style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 4px' }}>@</span>
              {getTeamLogoUrl(game.homeAbbr) && (
                <img src={getTeamLogoUrl(game.homeAbbr)} alt={game.homeAbbr} style={{
                  width: 26, height: 26, objectFit: 'contain',
                  filter: isDarkTeamLogo(game.homeAbbr) ? LOGO_WHITE_FILTER : undefined,
                }} />
              )}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>{game.park.name} HR History</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{game.park.city}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: 24 }}>Loading…</div>
          ) : error || !data ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: 24 }}>Couldn't load park HR history.</div>
          ) : (
            <>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700,
                color: data.confirmed ? 'var(--accent)' : '#eab308',
                background: data.confirmed ? 'var(--accent-dim)' : 'rgba(234,179,8,0.12)',
                padding: '3px 8px', borderRadius: 99, marginBottom: 12,
              }}>
                {data.confirmed ? '✓ Confirmed Lineups' : '~ Projected (Active Roster)'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 12 }}>
                Career = HRs at this park since {2015} (Statcast era) · Season = HRs at this park in {data.season}
              </div>

              {withHrs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: '12px 0' }}>
                  Nobody on either roster has homered here since 2015.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: withoutHrs.length ? 16 : 0 }}>
                  {withHrs.map(b => (
                    <Link
                      key={b.mlbId}
                      href={`/players/${b.mlbId}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderTop: '1px solid var(--border)', textDecoration: 'none', color: 'inherit', borderRadius: 6 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <PlayerAvatar headshot={mlbHeadshot(b.mlbId)} teamLogo={getTeamLogoUrl(b.team)} teamAbbr={b.team} name={b.name} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{b.team} · {b.position}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--accent)' }}>{b.career}</div>
                          <div style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.04em' }}>CAREER</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 15, fontWeight: 900, color: b.season > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>{b.season}</div>
                          <div style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.04em' }}>{data.season}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {withoutHrs.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 8 }}>NO HRs HERE SINCE 2015</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {withoutHrs.map(b => (
                      <Link key={b.mlbId} href={`/players/${b.mlbId}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 56, textDecoration: 'none' }}>
                        <PlayerAvatar headshot={mlbHeadshot(b.mlbId)} teamLogo={getTeamLogoUrl(b.team)} teamAbbr={b.team} name={b.name} size={36} style={{ opacity: 0.6 }} />
                        <span style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{b.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function GameCard({ game }: { game: WeatherGame }) {
  const [idx, setIdx] = useState(0)
  const h = game.hours[idx] ?? game.hours[0]
  // Wind color is now an HR-carry heat read (red = blowing in/suppressing,
  // yellow = neutral or crosswind, green = blowing out/boosting), computed
  // from wind direction relative to THIS park's actual center-field
  // orientation — a due-east wind helps at an east-facing park and hurts at
  // a west-facing one, so the same raw wind reading needs a different color
  // per park. The park shape itself stays two-tone in the home team's own
  // colors, unrelated to the wind read.
  const teamPrimary = getTeamColor(game.homeAbbr)
  const teamSecondary = getTeamSecondaryColor(game.homeAbbr)
  const gameTime = new Date(game.gameDate).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '')
  const dirs = h?.windDirDeg != null ? compassFromTo(h.windDirDeg) : null
  const logoUrl = getTeamLogoUrl(game.homeAbbr)
  const isSheltered = game.park.roof !== 'open'
  const [showParkHr, setShowParkHr] = useState(false)
  const hrWeather = hrWeatherScore({
    tempF: h?.tempF ?? null,
    humidity: h?.humidity ?? null,
    windDirDeg: h?.windDirDeg ?? null,
    windMph: h?.windMph ?? null,
    orientationDeg: game.park.orientationDeg,
    sheltered: isSheltered,
  })

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', transition: 'border-color 150ms' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
      {/* header — click to see who on both rosters has gone deep at this park */}
      <button
        onClick={() => setShowParkHr(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px',
          border: 'none', borderBottom: '1px solid var(--border)',
          background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {getTeamLogoUrl(game.awayAbbr) && <img src={getTeamLogoUrl(game.awayAbbr)} alt={game.awayAbbr} style={{ width: 16, height: 16, objectFit: 'contain' }} />}
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{game.awayTeam}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {logoUrl && <img src={logoUrl} alt={game.homeAbbr} style={{ width: 16, height: 16, objectFit: 'contain' }} />}
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{game.homeTeam}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{game.park.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>{gameTime}</div>
        </div>
      </button>

      {showParkHr && <ParkHrModal game={game} onClose={() => setShowParkHr(false)} />}

      {/* hour tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${game.hours.length}, 1fr)`, borderBottom: '1px solid var(--border)' }}>
        {game.hours.map((hr, i) => {
          const active = i === idx
          const d = hr.windDirDeg != null ? hr.windDirDeg + 180 : 0
          const heat = hrWindColor(hr.windDirDeg, hr.windMph, game.park.orientationDeg)
          return (
            <button
              key={hr.label}
              onClick={() => setIdx(i)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '7px 4px', border: 'none', borderRight: i < game.hours.length - 1 ? '1px solid var(--border)' : 'none',
                background: active ? 'var(--accent-dim)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: active ? 'var(--accent)' : 'var(--text-2)', fontWeight: active ? 700 : 500 }}>{hr.label}</span>
              {hr.windDirDeg != null && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={heat} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${d}deg)`, opacity: active ? 1 : 0.65 }}>
                  <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
                </svg>
              )}
              <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>{hr.windMph != null ? hr.windMph.toFixed(1) : '—'}</span>
            </button>
          )
        })}
      </div>

      {/* stats row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px 4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em' }}>WIND</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{h?.windMph != null ? `${h.windMph.toFixed(1)} mph` : '—'}</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{dirs ? `${dirs.from} to ${dirs.to}` : '—'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em' }}>FORECAST</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{h?.tempF != null ? `${Math.round(h.tempF)}°F` : '—'}</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)', maxWidth: '12ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {h?.weatherCode != null ? WMO_LABELS[h.weatherCode] ?? '—' : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em' }}>HUMIDITY</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{h?.humidity != null ? `${Math.round(h.humidity)}%` : '—'}</span>
        </div>
      </div>

      {/* HR weather read — live per-hour score from temp/humidity/wind vs
          this park's real orientation, not a static or scraped number.
          Green = favorable for the ball carrying out, red = suppressing,
          yellow/gray = roughly neutral. Recomputes with the hour tab above. */}
      <Tooltip content={hrWeather.label}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          margin: '2px 14px 0', padding: '6px 10px', borderRadius: 8, cursor: 'help',
          background: `${hrWeather.color.startsWith('rgb') ? hrWeather.color.replace('rgb(', 'rgba(').replace(')', ',0.14)') : hrWeather.color}`,
          border: `1px solid ${hrWeather.color}`,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em' }}>HR WEATHER</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: hrWeather.color }}>
            {hrWeather.score > 0 ? '+' : ''}{hrWeather.score.toFixed(1)}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '20ch' }}>
            {hrWeather.label}
          </span>
        </div>
      </Tooltip>

      {/* park visual */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 12px 12px', gap: 4 }}>
        <div style={{ position: 'relative', aspectRatio: '1/1', width: '100%', maxWidth: 220 }}>
          {/* Sheltered parks (dome/retractable) get the whole scene —
              park shape AND logo — grayed out and dimmed together, so it
              reads at a glance as "wind doesn't apply here" instead of
              looking like a normal live-wind park with just a small badge
              tacked on. The roof badge itself stays outside this wrapper
              so it's the one thing still at full color/opacity. */}
          <div style={isSheltered ? { position: 'absolute', inset: 0, filter: 'grayscale(1) brightness(0.55)' } : { position: 'absolute', inset: 0 }}>
            <ParkShape primary={teamPrimary} secondary={teamSecondary} teamAbbr={game.homeAbbr} />
            {logoUrl && (
              <img src={logoUrl} alt="" style={{
                // Was centered on the shape's overall middle, which sat right
                // on top of the sand diamond/bases. Every park uses the same
                // standard mound/plate coordinates regardless of outline
                // (sand diamond's top edge is ~138 in the shared 0-250
                // space), so there's clear room above it — but each park's
                // outfield WALL sits at a different height (some shallower,
                // some deeper), and at 24% wide the logo was tall enough to
                // poke through the wall on the shallower parks. Smaller (18%)
                // and nudged down slightly gives enough margin on both sides
                // for every park's actual outfield depth without per-park
                // tuning. Grayscale-at-low-opacity made dark-logo teams
                // (Cardinals, Angels, etc.) nearly invisible against the dark
                // card background — full color at near-full opacity instead.
                position: 'absolute', top: '34%', left: '50%', transform: 'translate(-50%,-50%)',
                width: '18%', opacity: 0.95, pointerEvents: 'none',
                // A handful of teams (Yankees, Twins, A's, Padres) have a
                // dark navy/near-black logo sitting on that SAME team's dark
                // park fill — same-hue-on-same-hue, so the logo nearly
                // vanishes regardless of opacity. Halo used to be flat
                // white for every team, which read as ugly/washed-out on
                // several teams — using that team's own secondary color
                // instead still solves the contrast problem but looks like
                // an intentional design choice per team rather than a
                // generic fix slapped on top.
                filter: `drop-shadow(0 0 2.5px ${hexToRgba(teamSecondary, 0.75)}) drop-shadow(0 0 2.5px ${hexToRgba(teamSecondary, 0.75)})`,
              }} />
            )}
          </div>
          {!isSheltered && <WindCanvas deg={h?.windDirDeg ?? null} mph={h?.windMph ?? null} color={hrWindColor(h?.windDirDeg ?? null, h?.windMph ?? null, game.park.orientationDeg)} />}
          {isSheltered && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(20,20,20,0.9)', border: '1px solid #eab308', borderRadius: 8, padding: '6px 10px', boxShadow: '0 0 12px rgba(0,0,0,0.6)' }}>
                <span style={{ color: '#eab308', fontSize: 12 }}>ⓘ</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#eab308' }}>{game.park.roof === 'dome' ? 'Fixed Roof' : 'Retractable Roof'}</span>
              </div>
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{game.park.name}, {game.park.city}</span>
      </div>
    </div>
  )
}

// Plain-string date math anchored at UTC noon so adding/subtracting days
// never gets tripped up by DST transitions shifting the wall-clock date.
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

// "Today" per the VISITOR'S own device clock/timezone — no server guess, no
// hardcoded zone. This used to be computed server-side pinned to America/
// New_York, and worse, the page had gone fully static (no dynamic APIs left
// in it) so that server-side "today" got baked in at deploy time and never
// moved — showing whatever date the last deploy happened to land on. Doing
// it here means it's always the real local date, and it's live per request.
function localToday(): string {
  return new Date().toLocaleDateString('en-CA')
}

function DateStrip({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = localToday()
  const days = [-3, -2, -1, 0, 1, 2, 3].map(offset => {
    const d = offsetDate(date, offset)
    const dt = new Date(d + 'T12:00:00Z')
    return {
      date: d,
      isSelected: d === date,
      isToday: d === today,
      dayName: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      // Day number only — "Jul 12" overflows a 7-across strip at 375px.
      dayNum: dt.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
    }
  })
  const prevDate = offsetDate(date, -1)
  const nextDate = offsetDate(date, 1)

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden', marginBottom: 20,
    }}>
      <button onClick={() => onChange(prevDate)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, flexShrink: 0, border: 'none', cursor: 'pointer',
        background: 'transparent', color: 'var(--text-3)', fontSize: 18, fontWeight: 700,
        borderRight: '1px solid var(--border)',
      }}>‹</button>
      {days.map(({ date: d, isSelected, isToday, dayName, dayNum }) => (
        <button key={d} onClick={() => onChange(d)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '10px 4px', gap: 3, border: 'none', cursor: 'pointer',
          background: isSelected ? 'var(--accent)' : 'transparent',
          borderRight: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? 'var(--accent-fg)' : isToday ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {dayName}
          </span>
          <span style={{ fontSize: 12, fontWeight: isSelected || isToday ? 900 : 600, color: isSelected ? 'var(--accent-fg)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>
            {dayNum}
          </span>
          {isToday && !isSelected && (
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
          )}
        </button>
      ))}
      <button onClick={() => onChange(nextDate)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, flexShrink: 0, border: 'none', cursor: 'pointer',
        background: 'transparent', color: 'var(--text-3)', fontSize: 18, fontWeight: 700,
      }}>›</button>
    </div>
  )
}

export function WeatherLabClient() {
  const [date, setDate] = useState<string>(() => localToday())
  const [games, setGames] = useState<WeatherGame[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/weather-lab?date=${date}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (!cancelled) setGames(d.games ?? []) })
      .catch(() => { if (!cancelled) setGames([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [date])

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-5 sm:px-6">
      <div className="fade-in" style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          Weather <span style={{ color: 'var(--accent)' }}>Lab</span>
          <span className="live-dot" />
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
          Live park-by-park conditions for every game — wind, temp, humidity, and roof status.
        </p>
      </div>

      <DateStrip date={date} onChange={setDate} />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
      ) : games.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No games with weather data for {date}.</div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {games.map(g => <GameCard key={g.gamePk} game={g} />)}
        </div>
      )}
    </div>
  )
}
