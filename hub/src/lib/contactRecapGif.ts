import sharp from 'sharp'
import { MLB_PARK_SHAPES } from '@slipsurge/core/mlbParkShapes'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamColor, getTeamLogoPngUrl, getTeamSecondaryColor } from '@slipsurge/core/mlbTeamColors'
import type { DailyContactEvent } from '@/lib/contactRecapTypes'

const W = 960
const H = 540

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!))
}

async function dataUri(url?: string) {
  if (!url) return ''
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!response.ok) return ''
    const mime = response.headers.get('content-type') || 'image/png'
    return `data:${mime};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
  } catch { return '' }
}

function metric(value: number | null, suffix: string) {
  return value == null ? '-' : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`
}

function frameSvg(event: DailyContactEvent, progress: number, assets: { headshot: string; batterLogo: string; homeLogo: string; awayLogo: string }) {
  const park = MLB_PARK_SHAPES[event.game.parkTeamAbbr]
  const primary = getTeamColor(event.game.parkTeamAbbr)
  const secondary = getTeamSecondaryColor(event.game.parkTeamAbbr)
  const accent = event.kind === 'home_run' ? '#a3ff3f' : '#ff9f43'
  const cx = 125 + (event.hcX - 125) * progress
  const controlY = Math.max(25, event.hcY - 72)
  const cy = ((1 - progress) ** 2 * 203) + (2 * (1 - progress) * progress * controlY) + (progress ** 2 * event.hcY)
  const parkPath = park?.outfield ?? 'M125 220 L45 135 A105 105 0 0 1 205 135 Z'
  const parkTransform = park?.transform ? ` transform="${esc(park.transform)}"` : ''
  const badges = [event.isFirstHr ? 'FIRST HR' : '', event.isGrandSlam ? 'GRAND SLAM' : '', Number(event.exitVelocity) >= 105 ? 'LASER' : '', Number(event.distance) >= 420 ? 'MOONSHOT' : ''].filter(Boolean).join('  ·  ')
  const path = `M125 203 Q${(125 + (event.hcX - 125) * .34).toFixed(1)} ${controlY.toFixed(1)} ${event.hcX.toFixed(1)} ${event.hcY.toFixed(1)}`
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#10181b"/><stop offset=".42" stop-color="#070b10"/><stop offset="1" stop-color="#020407"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern><clipPath id="avatar"><rect x="37" y="382" width="112" height="112" rx="22"/></clipPath></defs>
    <rect width="960" height="540" fill="url(#bg)"/><rect width="960" height="540" fill="url(#grid)"/>
    <rect x="24" y="20" width="912" height="55" rx="16" fill="#090e14" stroke="#fff" stroke-opacity=".09"/>
    ${assets.awayLogo ? `<image href="${assets.awayLogo}" x="42" y="31" width="33" height="33"/>` : ''}<text x="84" y="45" fill="#a3ff3f" font-family="monospace" font-size="10" font-weight="800" letter-spacing="1.3">GAME ${event.game.gameIndex + 1}  ·  ${esc(event.game.venueName).toUpperCase()}</text><text x="84" y="62" fill="#f4f7fb" font-family="Arial" font-size="14" font-weight="800">${esc(event.game.awayTeam)} ${event.game.awayScore ?? ''}  ·  ${esc(event.game.homeTeam)} ${event.game.homeScore ?? ''}</text>${assets.homeLogo ? `<image href="${assets.homeLogo}" x="885" y="31" width="33" height="33"/>` : ''}
    <g transform="translate(300 38) scale(1.85)"><g${parkTransform}><path d="${esc(parkPath)}" fill="${primary}" fill-opacity=".31" stroke="${primary}" stroke-opacity=".85" stroke-width="1.6"/></g><path d="M163.9 166.7l-1-1c-5-16-20-27.7-37.7-27.7s-32.7 11.7-37.7 27.7l-1 1 32.7 32.7 6 6 6-6z" fill="${secondary}" fill-opacity=".75"/><path d="M125 203L28 106M125 203L222 106" stroke="#fff" stroke-opacity=".6" stroke-width=".7"/><path d="${path}" pathLength="1" fill="none" stroke="${accent}" stroke-width="2.1" stroke-linecap="round" stroke-dasharray="${progress} 1" filter="url(#glow)"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${progress >= 1 ? 4.7 : 3.2}" fill="${accent}" stroke="#fff" stroke-width="1" filter="url(#glow)"/></g>
    <rect x="24" y="363" width="555" height="154" rx="22" fill="#0a1017" fill-opacity=".95" stroke="#fff" stroke-opacity=".1"/>
    <rect x="37" y="382" width="112" height="112" rx="22" fill="${getTeamColor(event.batterTeam)}" fill-opacity=".45" stroke="${accent}" stroke-opacity=".55"/>${assets.headshot ? `<image href="${assets.headshot}" x="37" y="382" width="112" height="112" preserveAspectRatio="xMidYMax meet" clip-path="url(#avatar)"/>` : ''}${assets.batterLogo ? `<circle cx="137" cy="484" r="17" fill="#060a0f"/><image href="${assets.batterLogo}" x="125" y="472" width="24" height="24"/>` : ''}
    <text x="168" y="397" fill="${accent}" font-family="monospace" font-size="9" font-weight="900" letter-spacing="1.4">${esc(event.kind === 'home_run' ? 'HOME RUN FLIGHT' : 'NEAR HOME RUN FLIGHT')}</text><text x="168" y="430" fill="#fff" font-family="Arial" font-size="28" font-weight="900">${esc(event.batterName)}</text><text x="168" y="453" fill="#9ba8ba" font-family="Arial" font-size="13" font-weight="700">${esc(event.batterTeam)}  ·  ${esc(event.half)} ${event.inning ?? '-'}  ·  off ${esc(event.pitcherName)}</text><text x="168" y="477" fill="#cbd5e1" font-family="Arial" font-size="12">${event.rbi ? `${event.rbi} RBI  ·  ` : ''}${esc(event.result.replaceAll('_',' '))}</text><text x="168" y="499" fill="#a3ff3f" font-family="monospace" font-size="9" font-weight="900" letter-spacing="1">${esc(badges)}</text>
    ${[['EXIT VELO',metric(event.exitVelocity,' mph')],['DISTANCE',metric(event.distance,' ft')],['LAUNCH',metric(event.launchAngle,'°')]].map((item,index) => `<rect x="${600 + index*113}" y="408" width="103" height="83" rx="16" fill="#0b1119" stroke="#fff" stroke-opacity=".09"/><text x="${614 + index*113}" y="431" fill="#69778c" font-family="monospace" font-size="8" font-weight="800" letter-spacing="1">${item[0]}</text><text x="${614 + index*113}" y="461" fill="#fff" font-family="Arial" font-size="17" font-weight="900">${esc(item[1])}</text>`).join('')}
    <text x="917" y="514" text-anchor="end" fill="#a3ff3f" font-family="Arial" font-size="11" font-weight="900">SLIPSURGE</text>
  </svg>`)
}

export async function renderContactRecapGif(events: DailyContactEvent[]) {
  const selected = events.slice(0, 60)
  if (!selected.length) throw new Error('There are no captured events to export.')
  const assetCache = new Map<string, string>()
  const load = async (url?: string) => {
    if (!url) return ''
    if (!assetCache.has(url)) assetCache.set(url, await dataUri(url))
    return assetCache.get(url) ?? ''
  }
  const rawFrames: Buffer[] = []
  const delays: number[] = []
  for (const event of selected) {
    const assets = {
      headshot: await load(mlbHeadshot(event.batterId)), batterLogo: await load(getTeamLogoPngUrl(event.batterTeam)),
      homeLogo: await load(getTeamLogoPngUrl(event.game.homeTeam)), awayLogo: await load(getTeamLogoPngUrl(event.game.awayTeam)),
    }
    for (const [progress, delay] of [[0.46, 220], [1, 1650]] as Array<[number, number]>) {
      const frame = await sharp(frameSvg(event, progress, assets)).ensureAlpha().raw().toBuffer()
      rawFrames.push(frame); delays.push(delay)
    }
  }
  return sharp(Buffer.concat(rawFrames), { raw: { width: W, height: H * rawFrames.length, channels: 4, pageHeight: H } })
    .gif({ loop: 0, delay: delays, colours: 192, effort: 5, interFrameMaxError: 4, keepDuplicateFrames: true })
    .toBuffer()
}
