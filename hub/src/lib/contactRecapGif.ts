import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import bundledFfmpegPath from 'ffmpeg-static'
import { MLB_PARK_SHAPES } from '@slipsurge/core/mlbParkShapes'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamColor, getTeamLogoPngUrl, getTeamSecondaryColor } from '@slipsurge/core/mlbTeamColors'
import type { ContactMarketQuote, DailyContactEvent } from '@/lib/contactRecapTypes'

const W = 1280
const H = 720
const FPS = 20
const MOTION_FRAMES = 20
const HOLD_FRAMES = 20
const SAND_DIAMOND = 'M163.9,166.7l-1-1c-5-16-20-27.7-37.7-27.7s-32.7,11.7-37.7,27.7l-1,1l32.7,32.7c-0.5,0.9-0.7,1.9-0.7,3c0,3.7,3,6.7,6.7,6.7s6.7-3,6.7-6.7c0-1.1-0.3-2.1-0.7-3L163.9,166.7z M122.5,154.7c0.8,0.5,1.7,0.8,2.7,0.8s1.9-0.3,2.7-0.8l16.8,16.8c-1.6,1.6-1.6,4.1,0,5.6l2.5,2.5l-17.7,17.7c-1.2-1-2.7-1.6-4.3-1.6s-3.2,0.6-4.3,1.6l-17.7-17.7l2.5-2.5c1.6-1.5,1.6-4,0-5.6L122.5,154.7z'

export type ContactRecapExportFormat = 'mp4' | 'gif'
export type ContactRecapExportAspect = 'landscape' | 'square' | 'vertical'

function resolveFfmpegPath() {
  const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const candidates = [
    join(process.cwd(), 'node_modules', 'ffmpeg-static', executable),
    bundledFfmpegPath,
    join('/var/task', 'node_modules', 'ffmpeg-static', executable),
    join('/var/task/hub', 'node_modules', 'ffmpeg-static', executable),
  ].filter((value): value is string => Boolean(value))
  const resolved = candidates.find(candidate => existsSync(candidate))
  if (!resolved) {
    console.error('[contact-recap-export] ffmpeg binary missing', { cwd: process.cwd(), candidates })
    throw new Error('The social video encoder is unavailable in this deployment.')
  }
  return resolved
}

const BOOK_ASSETS: Record<string, { path: string; mime: string }> = {
  fanduel: { path: 'sportsbooks/fanduel.ico', mime: 'image/x-icon' },
  draftkings: { path: 'sportsbooks/draftkings.png', mime: 'image/png' },
  williamhill_us: { path: 'sportsbooks/caesars.png', mime: 'image/png' },
  caesars: { path: 'sportsbooks/caesars.png', mime: 'image/png' },
  fanatics: { path: 'sportsbooks/fanatics.svg', mime: 'image/svg+xml' },
  betmgm: { path: 'sportsbooks/betmgm.png', mime: 'image/png' },
  betrivers: { path: 'sportsbooks/betrivers.ico', mime: 'image/x-icon' },
  pinnacle: { path: 'sportsbooks/pinnacle.ico', mime: 'image/x-icon' },
}

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!))
}

function american(value: number) {
  return value > 0 ? `+${value}` : String(value)
}

function metric(value: number | null, suffix: string) {
  return value == null ? '-' : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`
}

function compactText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

function svgDataUri(svg: string) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function initials(value: string, fallback: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}` : parts[0]?.slice(0, 2) || fallback).toUpperCase()
}

function fallbackBadge(label: string, color: string, kind: 'player' | 'team') {
  const safe = esc(initials(label, kind === 'player' ? 'P' : 'MLB'))
  const figure = kind === 'player'
    ? '<circle cx="64" cy="43" r="23" fill="#dce5ef" fill-opacity=".94"/><path d="M22 126c4-37 22-56 42-56s38 19 42 56" fill="#dce5ef" fill-opacity=".94"/>'
    : ''
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="28" fill="#071018"/><rect x="3" y="3" width="122" height="122" rx="25" fill="${esc(color)}" fill-opacity=".42" stroke="${esc(color)}" stroke-width="4"/>${figure}<text x="64" y="${kind === 'player' ? 119 : 76}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${kind === 'player' ? 20 : 42}" font-weight="900" fill="#fff">${safe}</text></svg>`)
}

function resultLabel(event: DailyContactEvent) {
  if (event.kind === 'home_run') return event.isGrandSlam ? 'GRAND SLAM' : `${Math.max(1, event.rbi)}-RUN HOME RUN`
  return event.result.replaceAll('_', ' ').toUpperCase()
}

function flightPoint(event: DailyContactEvent, progress: number) {
  const value = Math.max(0, Math.min(1, progress))
  const controlX = 125 + (event.hcX - 125) * .34
  const controlY = Math.max(22, event.hcY - 78)
  return {
    x: ((1 - value) ** 2 * 125) + (2 * (1 - value) * value * controlX) + (value ** 2 * event.hcX),
    y: ((1 - value) ** 2 * 203) + (2 * (1 - value) * value * controlY) + (value ** 2 * event.hcY),
  }
}

async function remoteDataUri(url?: string) {
  if (!url) return ''
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!response.ok) return ''
    const mime = response.headers.get('content-type') || 'image/png'
    return `data:${mime};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
  } catch { return '' }
}

async function localDataUri(path: string, mime: string) {
  try {
    const body = await readFile(join(process.cwd(), 'public', path))
    return `data:${mime};base64,${body.toString('base64')}`
  } catch { return '' }
}

async function loadSharpWithBundledFont() {
  const fontPath = join(process.cwd(), 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og', 'Geist-Regular.ttf')
  const configDir = join(tmpdir(), 'slipsurge-fontconfig')
  const configPath = join(configDir, 'fonts.conf')
  const cacheDir = join(configDir, 'cache')
  const runtimeFontPath = join(configDir, 'Geist-Regular.ttf')
  const xmlPath = (value: string) => esc(value.replaceAll('\\', '/'))
  await mkdir(cacheDir, { recursive: true })
  await writeFile(runtimeFontPath, await readFile(fontPath))
  await writeFile(configPath, `<?xml version="1.0"?>
<fontconfig>
  <dir>${xmlPath(configDir)}</dir>
  <cachedir>${xmlPath(cacheDir)}</cachedir>
  <alias><family>sans-serif</family><prefer><family>Geist</family></prefer></alias>
  <alias><family>GeistExport</family><prefer><family>Geist</family></prefer></alias>
</fontconfig>`)
  process.env.FONTCONFIG_FILE = configPath
  process.env.FONTCONFIG_PATH = configDir
  const sharp = (await import('sharp')).default
  sharp.cache(false)
  sharp.concurrency(1)
  return sharp
}

type FrameAssets = {
  brandLogo: string
  headshot: string
  batterLogo: string
  parkLogo: string
  homeLogo: string
  awayLogo: string
  bookLogos: Record<string, string>
}

function infieldDetail(secondary: string) {
  return `<path d="${SAND_DIAMOND}" fill="${secondary}" fill-opacity=".8" stroke="${secondary}" stroke-opacity="1" stroke-width=".75"/><g fill="none" stroke="#fff" stroke-width=".75" opacity=".88"><path d="M122.5,174.7c-1.5,1.5-1.5,3.9,0,5.4s3.9,1.5,5.4,0c1.5-1.5,1.5-3.9,0-5.4C126.5,173.2,124,173.2,122.5,174.7z" fill="#fff"/><path d="M123.2,176.6h4v1.6h-4V176.6z" fill="#fff"/><path d="M125.2,203.2l-97.1-97.1"/><path d="M125.2,203.2l97.1-97.2"/><rect x="99.2" y="175.1" width="3" height="3" transform="matrix(.7073 -.7069 .7069 .7073 -95.3473 122.8833)" fill="#fff"/><rect x="148.1" y="175.2" width="3" height="3" transform="matrix(.7073 -.7069 .7069 .7073 -81.1078 157.4629)" fill="#fff"/><rect x="123.7" y="148.6" width="3" height="3" transform="matrix(.707 -.7073 .7073 .707 -69.4796 132.5406)" fill="#fff"/><polygon points="126.7,201.8 125.2,203.4 123.7,201.8 123.7,200.3 126.7,200.3" fill="#fff"/></g>`
}

function quoteCards(quotes: ContactMarketQuote[], assets: FrameAssets, x: number, y: number) {
  const visible = quotes.slice(0, 6)
  if (!visible.length) {
    return `<rect x="${x}" y="${y}" width="484" height="68" rx="16" class="card"/><text x="${x + 18}" y="${y + 29}" class="meta">SPORTSBOOK ODDS</text><text x="${x + 18}" y="${y + 51}" class="muted">Odds unavailable</text>`
  }
  return visible.map((quote, index) => {
    const cardX = x + (index % 3) * 158
    const cardY = y + Math.floor(index / 3) * 64
    const logo = assets.bookLogos[quote.book]
    return `<rect x="${cardX}" y="${cardY}" width="148" height="54" rx="14" class="card"/>${logo ? `<image href="${logo}" x="${cardX + 10}" y="${cardY + 11}" width="31" height="31" preserveAspectRatio="xMidYMid meet"/>` : ''}<text x="${cardX + 50}" y="${cardY + 21}" class="book">${esc(quote.bookLabel)}</text><text x="${cardX + 50}" y="${cardY + 42}" class="price">${american(quote.odds)}</text>`
  }).join('')
}

function prioritizedSpecialQuotes(quotes: ContactMarketQuote[]) {
  const firstByMarket: ContactMarketQuote[] = []
  const additionalBooks: ContactMarketQuote[] = []
  const seen = new Set<string>()
  for (const quote of quotes) {
    if (seen.has(quote.marketKey)) additionalBooks.push(quote)
    else {
      seen.add(quote.marketKey)
      firstByMarket.push(quote)
    }
  }
  return [...firstByMarket, ...additionalBooks]
}

function specialCards(quotes: ContactMarketQuote[], assets: FrameAssets, x: number, y: number) {
  return quotes.map((quote, index) => {
    const cardX = x + (index % 2) * 238
    const cardY = y + Math.floor(index / 2) * 52
    const logo = assets.bookLogos[quote.book]
    return `<rect x="${cardX}" y="${cardY}" width="226" height="43" rx="12" fill="#a3ff3f" fill-opacity=".075" stroke="#a3ff3f" stroke-opacity=".2"/>${logo ? `<image href="${logo}" x="${cardX + 10}" y="${cardY + 9}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>` : ''}<text x="${cardX + 42}" y="${cardY + 18}" class="specialLabel">${esc(quote.marketLabel)}</text><text x="${cardX + 42}" y="${cardY + 35}" class="specialPrice">${american(quote.odds)}</text>`
  }).join('')
}

function frameSvg(event: DailyContactEvent, rawProgress: number, assets: FrameAssets, eventIndex: number, eventTotal: number) {
  const progress = 1 - Math.pow(1 - rawProgress, 3)
  const park = MLB_PARK_SHAPES[event.game.parkTeamAbbr]
  const primary = getTeamColor(event.game.parkTeamAbbr)
  const secondary = getTeamSecondaryColor(event.game.parkTeamAbbr)
  const accent = event.kind === 'home_run' ? '#a3ff3f' : '#ff9f43'
  const controlY = Math.max(22, event.hcY - 78)
  const currentPoint = flightPoint(event, progress)
  const cx = currentPoint.x
  const cy = currentPoint.y
  const parkPath = park?.outfield ?? 'M125 220 L45 135 A105 105 0 0 1 205 135 Z'
  const parkTransform = park?.transform ? ` transform="${esc(park.transform)}"` : ''
  const badges = [
    event.isFirstHr ? 'FIRST HR' : '',
    event.isGrandSlam ? 'GRAND SLAM' : '',
  ].filter(Boolean)
  const flightPath = `M125 203 Q${(125 + (event.hcX - 125) * .34).toFixed(1)} ${controlY.toFixed(1)} ${event.hcX.toFixed(1)} ${event.hcY.toFixed(1)}`
  const primaryQuotes = event.marketContext?.primary ?? []
  const specials = event.marketContext?.specials ?? []
  const specialY = primaryQuotes.length > 3 ? 647 : 584
  const specialLimit = primaryQuotes.length > 3 ? 2 : 4
  const visibleSpecials = prioritizedSpecialQuotes(specials).slice(0, specialLimit)
  const hiddenSpecialCount = Math.max(0, new Set(specials.map(quote => quote.marketKey)).size - new Set(visibleSpecials.map(quote => quote.marketKey)).size)
  const specialMoreY = specialY - 13
  const badgeKeys = new Set(specials.map(quote => quote.marketKey))
  if (badgeKeys.has('pa1')) badges.push('1ST PA HR')
  if (badgeKeys.has('hr2')) badges.push('2+ HOME RUNS')
  if (badgeKeys.has('hrMl')) badges.push('HR + TEAM WIN')
  if (Number(event.exitVelocity) >= 110) badges.push('LASER 110+')
  else if (Number(event.exitVelocity) >= 105) badges.push('LASER 105+')
  if (Number(event.distance) >= 420) badges.push('MOONSHOT 420+')
  const visibleBadges = badges.slice(0, 4)
  const badgeMarkup = visibleBadges.map((badge, index) => `<rect x="${174 + index * 118}" y="565" width="110" height="22" rx="11" fill="${accent}" fill-opacity=".11" stroke="${accent}" stroke-opacity=".35"/><text x="${229 + index * 118}" y="580" text-anchor="middle" class="badge" fill="${accent}">${esc(compactText(badge, 15))}</text>`).join('')
  const sourceLabel = resultLabel(event)
  const venueLabel = compactText(event.game.venueName.toUpperCase(), 34)
  const batterLabel = compactText(event.batterName, 29)
  const batterTitleSize = batterLabel.length > 25 ? 27 : batterLabel.length > 21 ? 30 : 34
  const pitchReceipt = event.pitchType ? ` / ${event.pitchType}${event.pitchSpeed != null ? ` ${event.pitchSpeed.toFixed(1)} mph` : ''}` : ''
  const matchupDetails = compactText(`${event.batterTeam} / ${event.half} ${event.inning ?? '-'} / off ${event.pitcherName}${pitchReceipt}`, 70)
  const matchupLabel = compactText(`${event.batterTeam}  ·  ${event.half} ${event.inning ?? '-'}  ·  off ${event.pitcherName}`, 58)
  const tailMarkup = Array.from({ length: 6 }, (_, index) => {
    const point = flightPoint(event, Math.max(0, progress - ((index + 1) * .018)))
    const opacity = Math.max(.03, .34 - index * .05)
    return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${Math.max(1.2, 3.2 - index * .32).toFixed(1)}" fill="${accent}" fill-opacity="${opacity.toFixed(2)}" filter="url(#glow)"/>`
  }).join('')
  const landingProgress = Math.max(0, Math.min(1, (rawProgress - .78) / .22))
  const landingRings = landingProgress > 0
    ? `<circle cx="${event.hcX}" cy="${event.hcY}" r="${(5 + landingProgress * 13).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="1.2" stroke-opacity="${(.64 * (1 - landingProgress)).toFixed(2)}"/><circle cx="${event.hcX}" cy="${event.hcY}" r="${(4 + landingProgress * 7).toFixed(1)}" fill="none" stroke="#fff" stroke-width=".65" stroke-opacity="${(.48 * (1 - landingProgress)).toFixed(2)}"/>`
    : ''
  const sequenceProgress = Math.max(0, Math.min(1, (eventIndex + rawProgress) / Math.max(1, eventTotal)))
  const sequenceLabel = `${String(eventIndex + 1).padStart(2, '0')} / ${String(eventTotal).padStart(2, '0')}`

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <style>.eyebrow{font:800 13px Geist,sans-serif;letter-spacing:2.2px;fill:${accent}}.title{font:900 34px Geist,sans-serif;fill:#fff}.subtitle{font:650 15px Geist,sans-serif;fill:#9aa8bb}.body{font:650 14px Geist,sans-serif;fill:#d7dee8}.meta{font:800 10px Geist,sans-serif;letter-spacing:1.5px;fill:#718096}.muted{font:650 13px Geist,sans-serif;fill:#8290a3}.book{font:750 9px Geist,sans-serif;fill:#8190a3}.price{font:900 18px Geist,sans-serif;fill:#fff}.specialLabel{font:750 9px Geist,sans-serif;fill:#8fa0b4}.specialPrice{font:900 14px Geist,sans-serif;fill:#a3ff3f}.metricLabel{font:800 9px Geist,sans-serif;letter-spacing:1.4px;fill:#718096}.metricValue{font:900 21px Geist,sans-serif;fill:#fff}.badge{font:850 10px Geist,sans-serif;letter-spacing:1px}.score{font:850 15px Geist,sans-serif;fill:#fff}.brand{font:900 20px Geist,sans-serif;fill:#fff}.brandSmall{font:750 10px Geist,sans-serif;letter-spacing:1.7px;fill:#a3ff3f}.card{fill:#111820;stroke:#fff;stroke-opacity:.09}</style>
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#111b18"/><stop offset=".39" stop-color="#070c11"/><stop offset="1" stop-color="#020407"/></linearGradient><linearGradient id="panel" x2="1" y2="1"><stop stop-color="#121b22"/><stop offset=".48" stop-color="#0b1118"/><stop offset="1" stop-color="#060a0f"/></linearGradient><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".095"/><stop offset=".32" stop-color="#fff" stop-opacity=".018"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="parkAura"><stop stop-color="${primary}" stop-opacity=".16"/><stop offset="1" stop-color="${primary}" stop-opacity="0"/></radialGradient><filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="logoGlow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="2.4" flood-color="${secondary}" flood-opacity=".9"/></filter><pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern><clipPath id="avatar"><rect x="45" y="449" width="110" height="110" rx="22"/></clipPath></defs>
    <rect width="1280" height="720" fill="url(#bg)"/><rect width="1280" height="720" fill="url(#grid)"/><circle cx="140" cy="-30" r="250" fill="#a3ff3f" fill-opacity=".04"/><ellipse cx="640" cy="254" rx="340" ry="260" fill="url(#parkAura)"/><path d="M-60 245 L540 -55 L740 -55 L140 245 Z" fill="url(#glass)" opacity=".42"/>
    <rect x="28" y="24" width="1224" height="70" rx="20" fill="#080e13" stroke="#fff" stroke-opacity=".1"/>
    ${assets.brandLogo ? `<image href="${assets.brandLogo}" x="43" y="35" width="48" height="48"/>` : ''}<text x="102" y="53" class="brand">SlipSurge</text><text x="102" y="73" class="brandSmall">CONTACT RECAP</text>
    ${assets.awayLogo ? `<image href="${assets.awayLogo}" x="488" y="40" width="39" height="39"/>` : ''}<text x="541" y="55" class="score">${esc(event.game.awayTeam)} ${event.game.awayScore ?? '-'}</text><text x="632" y="55" class="muted">at</text><text x="666" y="55" class="score">${esc(event.game.homeTeam)} ${event.game.homeScore ?? '-'}</text>${assets.homeLogo ? `<image href="${assets.homeLogo}" x="756" y="40" width="39" height="39"/>` : ''}<text x="541" y="76" class="meta">GAME ${event.game.gameIndex + 1}  &#8226;  ${esc(venueLabel)}</text>
    <text x="1220" y="53" text-anchor="end" class="brandSmall">${esc(event.gameDate)}</text><text x="1220" y="75" text-anchor="end" class="muted">SLIPSURGE.COM  &#8226;  ${sequenceLabel}</text>
    <g transform="translate(455 82) scale(1.48)"><g${parkTransform}><path d="${esc(parkPath)}" fill="${primary}" fill-opacity=".34" stroke="${primary}" stroke-opacity=".95" stroke-width="1.65"/></g>${assets.parkLogo ? `<image href="${assets.parkLogo}" x="102.5" y="63" width="45" height="45" preserveAspectRatio="xMidYMid meet" opacity=".95" filter="url(#logoGlow)"/>` : ''}${infieldDetail(secondary)}<path d="${flightPath}" pathLength="1" fill="none" stroke="${accent}" stroke-opacity=".16" stroke-width="6.5" stroke-linecap="round" stroke-dasharray="${progress} 1" filter="url(#glow)"/><path d="${flightPath}" pathLength="1" fill="none" stroke="${accent}" stroke-width="2.25" stroke-linecap="round" stroke-dasharray="${progress} 1" filter="url(#glow)"/>${tailMarkup}${landingRings}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rawProgress >= 1 ? 4.9 : 3.6}" fill="${accent}" stroke="#fff" stroke-width="1" filter="url(#glow)"/></g>
    <rect x="28" y="397" width="190" height="24" rx="12" fill="${accent}" fill-opacity=".08" stroke="${accent}" stroke-opacity=".22"/><text x="123" y="413" text-anchor="middle" class="badge" fill="${accent}">${sourceLabel}</text>
    <rect x="28" y="430" width="672" height="264" rx="26" fill="url(#panel)" fill-opacity=".97" stroke="#fff" stroke-opacity=".11"/><path d="M54 431 H674 Q698 431 698 455" fill="none" stroke="#fff" stroke-opacity=".08"/>
    <rect x="45" y="449" width="110" height="110" rx="22" fill="${getTeamColor(event.batterTeam)}" fill-opacity=".45" stroke="${accent}" stroke-opacity=".55"/>${assets.headshot ? `<image href="${assets.headshot}" x="45" y="449" width="110" height="110" preserveAspectRatio="xMidYMax meet" clip-path="url(#avatar)"/>` : ''}${assets.batterLogo ? `<circle cx="145" cy="549" r="18" fill="#05090d" stroke="#fff" stroke-opacity=".14"/><image href="${assets.batterLogo}" x="133" y="537" width="24" height="24"/>` : ''}
    <text x="174" y="459" class="eyebrow">${esc(event.kind === 'home_run' ? 'HOME RUN' : 'NEAR HOME RUN')}</text><text x="174" y="497" class="title" style="font-size:${batterTitleSize}px">${esc(batterLabel)}</text><text x="174" y="525" class="subtitle">${esc(matchupDetails)}</text><text x="174" y="555" class="body">${esc(resultLabel(event))}</text>
    ${badgeMarkup}
    ${[['EXIT VELO', metric(event.exitVelocity, ' mph')], ['DISTANCE', metric(event.distance, ' ft')], ['LAUNCH', metric(event.launchAngle, '°')], ['PARKS', event.kind === 'near_hr' && event.parksHrCount != null ? `${event.parksHrCount}/30` : event.game.parkTeamAbbr]].map((item,index) => `<rect x="${174 + index * 123}" y="599" width="113" height="64" rx="15" fill="#0b1118" stroke="#fff" stroke-opacity=".08"/><text x="${188 + index * 123}" y="620" class="metricLabel">${item[0]}</text><text x="${188 + index * 123}" y="648" class="metricValue">${esc(item[1])}</text>`).join('')}
    <rect x="720" y="430" width="532" height="264" rx="26" fill="url(#panel)" fill-opacity=".98" stroke="#fff" stroke-opacity=".11"/><path d="M746 431 H1226 Q1250 431 1250 455" fill="none" stroke="#fff" stroke-opacity=".08"/>
    <text x="744" y="459" class="eyebrow">SPORTSBOOK ODDS</text><text x="744" y="483" class="subtitle">${esc(event.marketContext?.primaryLabel ?? 'Result market')}</text>
    ${quoteCards(primaryQuotes, assets, 744, 503)}
    ${specials.length ? `<text x="744" y="${specialY - 13}" class="meta">OTHER MARKETS</text>${specialCards(visibleSpecials, assets, 744, specialY)}${hiddenSpecialCount ? `<text x="1228" y="${specialMoreY}" text-anchor="end" class="meta">+${hiddenSpecialCount} MORE MARKETS</text>` : ''}` : ''}
    <rect x="0" y="716" width="1280" height="4" fill="#fff" fill-opacity=".05"/><rect x="0" y="716" width="${(1280 * sequenceProgress).toFixed(1)}" height="4" fill="${accent}" filter="url(#glow)"/>
  </svg>`)
}

async function buildAssets(event: DailyContactEvent, cache: Map<string, string>, brandLogo: string, bookLogos: Record<string, string>): Promise<FrameAssets> {
  const load = async (url?: string) => {
    if (!url) return ''
    if (!cache.has(url)) cache.set(url, await remoteDataUri(url))
    return cache.get(url) ?? ''
  }
  const batterColor = getTeamColor(event.batterTeam)
  const parkColor = getTeamColor(event.game.parkTeamAbbr)
  const homeColor = getTeamColor(event.game.homeTeam)
  const awayColor = getTeamColor(event.game.awayTeam)
  const [headshot, batterLogo, parkLogo, homeLogo, awayLogo] = await Promise.all([
    load(mlbHeadshot(event.batterId)),
    load(getTeamLogoPngUrl(event.batterTeam)),
    load(getTeamLogoPngUrl(event.game.parkTeamAbbr)),
    load(getTeamLogoPngUrl(event.game.homeTeam)),
    load(getTeamLogoPngUrl(event.game.awayTeam)),
  ])
  return {
    brandLogo, bookLogos,
    headshot: headshot || fallbackBadge(event.batterName, batterColor, 'player'),
    batterLogo: batterLogo || fallbackBadge(event.batterTeam, batterColor, 'team'),
    parkLogo: parkLogo || fallbackBadge(event.game.parkTeamAbbr, parkColor, 'team'),
    homeLogo: homeLogo || fallbackBadge(event.game.homeTeam, homeColor, 'team'),
    awayLogo: awayLogo || fallbackBadge(event.game.awayTeam, awayColor, 'team'),
  }
}

async function writeFrame(stream: NodeJS.WritableStream, frame: Buffer, copies = 1) {
  for (let index = 0; index < copies; index += 1) {
    if (!stream.write(frame)) await once(stream, 'drain')
  }
}

function encoderFailureMessage(errors: Buffer[], fallback: string) {
  return Buffer.concat(errors).toString('utf8').trim() || fallback
}

async function runFfmpeg(ffmpegPath: string, args: string[]) {
  const process = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  const errors: Buffer[] = []
  process.stderr.on('data', chunk => errors.push(Buffer.from(chunk)))
  const spawnFailure = new Promise<never>((_, reject) => {
    process.once('error', error => reject(new Error(`Could not start the social video encoder: ${error.message}`)))
  })
  const [exitCode] = await Promise.race([once(process, 'close'), spawnFailure]) as [number]
  if (exitCode !== 0) throw new Error(encoderFailureMessage(errors, `Video encoder exited with code ${exitCode}.`))
}

async function reframeVideo(ffmpegPath: string, sourcePath: string, targetPath: string, aspect: Exclude<ContactRecapExportAspect, 'landscape'>) {
  const filter = aspect === 'square'
    ? '[0:v]split=2[bg][fg];[bg]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,boxblur=24:2,eq=brightness=-0.34:saturation=0.85[back];[fg]scale=1040:-2:flags=lanczos[front];[back][front]overlay=20:(H-h)/2,setsar=1[out]'
    : '[0:v]split=4[bg][top][left][right];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2,eq=brightness=-0.38:saturation=0.78[back];[top]crop=1280:430:0:0,scale=1040:-2:flags=lanczos[topv];[left]crop=672:264:28:430,scale=1040:-2:flags=lanczos[leftv];[right]crop=532:264:720:430,scale=1040:-2:flags=lanczos[rightv];[back][topv]overlay=20:80[a];[a][leftv]overlay=20:590[b];[b][rightv]overlay=20:1080,setsar=1[out]'
  await runFfmpeg(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
    '-filter_complex', filter, '-map', '[out]', '-an', '-c:v', 'libx264',
    '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', targetPath,
  ])
}

export async function renderContactRecap(events: DailyContactEvent[], format: ContactRecapExportFormat, aspect: ContactRecapExportAspect = 'landscape') {
  const selected = events.slice(0, 60)
  if (!selected.length) throw new Error('There are no captured events to export.')
  const ffmpegPath = resolveFfmpegPath()
  const workDir = await mkdtemp(join(tmpdir(), 'slipsurge-contact-'))
  const sourcePath = join(workDir, 'source.mp4')
  const socialVideoPath = aspect === 'landscape' ? sourcePath : join(workDir, `recap-${aspect}.mp4`)
  const finalPath = format === 'mp4' ? socialVideoPath : join(workDir, `recap-${aspect}.gif`)
  const palettePath = join(workDir, 'palette.png')
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(FPS), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', sourcePath]
  const encoder = spawn(ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] })
  const spawnFailure = new Promise<never>((_, reject) => {
    encoder.once('error', error => reject(new Error(`Could not start the social video encoder: ${error.message}`)))
  })
  const errors: Buffer[] = []
  encoder.stderr.on('data', chunk => errors.push(Buffer.from(chunk)))
  const cache = new Map<string, string>()
  const sharp = await loadSharpWithBundledFont()
  const brandLogo = await localDataUri('logo.png', 'image/png')
  if (!brandLogo) throw new Error('SlipSurge brand logo is unavailable; refusing to render an unbranded export')
  const bookLogos: Record<string, string> = {}
  await Promise.all(Object.entries(BOOK_ASSETS).map(async ([book, asset]) => { bookLogos[book] = await localDataUri(asset.path, asset.mime) }))
  try {
    for (let eventIndex = 0; eventIndex < selected.length; eventIndex += 1) {
      const event = selected[eventIndex]
      const assets = await buildAssets(event, cache, brandLogo, bookLogos)
      let finalFrame: Buffer | null = null
      for (let index = 0; index < MOTION_FRAMES; index += 1) {
        const progress = index / (MOTION_FRAMES - 1)
        const frame = await sharp(frameSvg(event, progress, assets, eventIndex, selected.length)).png({ compressionLevel: 3 }).toBuffer()
        finalFrame = frame
        await writeFrame(encoder.stdin, frame)
      }
      if (finalFrame) await writeFrame(encoder.stdin, finalFrame, HOLD_FRAMES)
    }
    encoder.stdin.end()
    const [exitCode] = await Promise.race([once(encoder, 'close'), spawnFailure]) as [number]
    if (exitCode !== 0) throw new Error(encoderFailureMessage(errors, `Video encoder exited with code ${exitCode}.`))
    if (aspect !== 'landscape') await reframeVideo(ffmpegPath, sourcePath, socialVideoPath, aspect)
    if (format === 'gif') {
      const scale = aspect === 'vertical' ? '540:-2' : aspect === 'square' ? '800:-2' : '960:-2'
      const filters = `fps=12,scale=${scale}:flags=lanczos`
      await runFfmpeg(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', socialVideoPath, '-vf', `${filters},palettegen=max_colors=160:stats_mode=diff`, palettePath])
      await runFfmpeg(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', socialVideoPath, '-i', palettePath, '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`, '-loop', '0', finalPath])
    }
    return await readFile(finalPath)
  } catch (error) {
    encoder.kill('SIGKILL')
    throw error
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

export async function renderContactRecapGif(events: DailyContactEvent[]) {
  return renderContactRecap(events, 'gif')
}

export type ContactAlertMedia = {
  body: Buffer
  filename: string
  contentType: 'image/gif' | 'image/png'
  width: number
  height: number
  animated: boolean
}

// Discord's inline image limit varies by guild. Keep enough headroom for
// multipart overhead and fall back to a fully branded static receipt rather
// than posting a broken/oversized animation.
const DISCORD_ALERT_MAX_BYTES = 9_000_000

export async function renderContactAlertMedia(event: DailyContactEvent): Promise<ContactAlertMedia> {
  const stem = `slipsurge-${event.kind === 'home_run' ? 'home-run' : 'near-home-run'}-${event.gamePk}-${event.atBatIndex}`
  try {
    const body = await renderContactRecap([event], 'gif', 'landscape')
    const sharp = await loadSharpWithBundledFont()
    const metadata = await sharp(body, { animated: true }).metadata()
    if (metadata.width !== 960 || metadata.pageHeight !== 540 || Number(metadata.pages ?? 1) < 2) {
      throw new Error(`Animated alert dimensions were ${metadata.width}x${metadata.pageHeight} (${metadata.pages ?? 1} frames), expected 960x540`)
    }
    if (body.byteLength <= 0 || body.byteLength > DISCORD_ALERT_MAX_BYTES) {
      throw new Error(`Animated alert size ${body.byteLength} is outside Discord delivery limits`)
    }
    return { body, filename: `${stem}.gif`, contentType: 'image/gif', width: 960, height: 540, animated: true }
  } catch (error) {
    console.error('[contact-alert] GIF render fell back to PNG', { reason: error instanceof Error ? error.message : String(error) })
    const sharp = await loadSharpWithBundledFont()
    const brandLogo = await localDataUri('logo.png', 'image/png')
    if (!brandLogo) throw new Error('SlipSurge brand logo is unavailable; refusing to render an unbranded alert')
    const bookLogos: Record<string, string> = {}
    await Promise.all(Object.entries(BOOK_ASSETS).map(async ([book, asset]) => { bookLogos[book] = await localDataUri(asset.path, asset.mime) }))
    const assets = await buildAssets(event, new Map(), brandLogo, bookLogos)
    const body = await sharp(frameSvg(event, 1, assets, 0, 1)).png({ compressionLevel: 7 }).toBuffer()
    const metadata = await sharp(body).metadata()
    if (metadata.width !== W || metadata.height !== H || body.byteLength <= 0) {
      throw new Error(`Static alert dimensions were ${metadata.width}x${metadata.height}, expected ${W}x${H}`)
    }
    return { body, filename: `${stem}.png`, contentType: 'image/png', width: W, height: H, animated: false }
  }
}
