import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import type { NflTouchdownEvent, NflTouchdownMarketQuote } from '@/lib/nflTouchdownFeed'

const WIDTH = 960
const HEIGHT = 540
const FRAMES = 24
const FPS = 12
const BOOK_ASSETS: Record<string, { path: string; mime: string; label: string }> = {
  fanduel: { path: 'sportsbooks/fanduel.ico', mime: 'image/x-icon', label: 'FANDUEL' },
  draftkings: { path: 'sportsbooks/draftkings.png', mime: 'image/png', label: 'DRAFTKINGS' },
  betmgm: { path: 'sportsbooks/betmgm.png', mime: 'image/png', label: 'BETMGM' },
  caesars: { path: 'sportsbooks/caesars.png', mime: 'image/png', label: 'CAESARS' },
  fanatics: { path: 'sportsbooks/fanatics.svg', mime: 'image/svg+xml', label: 'FANATICS' },
  betrivers: { path: 'sportsbooks/betrivers.ico', mime: 'image/x-icon', label: 'BETRIVERS' },
}
const BOOK_ORDER = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'fanatics', 'betrivers']

type Assets = { brand: string; headshot: string; teamLogo: string; opponentLogo: string; books: Record<string, string> }

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!))
}
function compact(value: string, size: number) { return value.length > size ? `${value.slice(0, size - 1).trimEnd()}…` : value }
function american(value: number | null) { return value == null ? '—' : value > 0 ? `+${value}` : String(value) }
function ease(value: number) { return 1 - ((1 - value) ** 3) }
function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)) }

type ScoringPath = {
  path: string
  markerX: number
  markerY: number
  startX: number
  startY: number
  endX: number
  endY: number
  displaySpan: number
  distance: number
}

function scoringPath(event: NflTouchdownEvent, progress: number): ScoringPath {
  const fieldLeft = 66
  const goalLine = 556
  const endX = 568
  const reportedYards = Math.abs(Number(event.yards ?? 0))
  const reportedToGoal = Math.abs(Number(event.startYardsToEndzone ?? 0))
  // The scoring play's official yardage is the best directional source. Some
  // providers report the post-play end-zone coordinate as both start and end.
  const distance = clamp(reportedYards > 0 ? reportedYards : reportedToGoal > 0 ? reportedToGoal : 1, 1, 100)
  const displaySpan = distance <= 10 ? 12 : distance <= 20 ? 25 : clamp(Math.ceil(distance / 10) * 10, 30, 100)
  const pixelsPerYard = (goalLine - fieldLeft) / displaySpan
  const startX = clamp(goalLine - (distance * pixelsPerYard), fieldLeft, goalLine - 10)
  const seed = Array.from(event.id).reduce((value, char) => value + char.charCodeAt(0), 0)
  const lane = (seed % 5) - 2
  const startY = clamp(239 + lane * 24, 175, 303)
  const endY = clamp(239 + (((seed >> 2) % 3) - 1) * 18, 184, 294)
  const value = ease(clamp(progress, 0, 1))
  const markerX = startX + ((endX - startX) * value)
  let markerY = startY + ((endY - startY) * value)
  let path: string

  if (event.kind === 'receiving') {
    const stemX = startX + ((endX - startX) * .48)
    const breakY = clamp(endY + (lane >= 0 ? 42 : -42), 168, 310)
    path = `M${startX.toFixed(1)} ${startY.toFixed(1)} C${(startX + 34).toFixed(1)} ${startY.toFixed(1)} ${(stemX - 20).toFixed(1)} ${startY.toFixed(1)} ${stemX.toFixed(1)} ${breakY.toFixed(1)} S${(goalLine - 22).toFixed(1)} ${endY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`
    markerY += Math.sin(value * Math.PI) * (breakY - startY) * .58
  } else if (event.kind === 'rushing') {
    const cutY = clamp(startY + (lane % 2 === 0 ? -28 : 28), 176, 302)
    path = `M${startX.toFixed(1)} ${startY.toFixed(1)} C${(startX + 24).toFixed(1)} ${startY.toFixed(1)} ${(startX + ((endX - startX) * .48)).toFixed(1)} ${cutY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`
    markerY += Math.sin(value * Math.PI) * (cutY - startY) * .72
  } else {
    const sweepY = clamp(startY + (lane >= 0 ? -62 : 62), 166, 312)
    path = `M${startX.toFixed(1)} ${startY.toFixed(1)} C${(startX + ((endX - startX) * .25)).toFixed(1)} ${sweepY.toFixed(1)} ${(startX + ((endX - startX) * .68)).toFixed(1)} ${(315 - sweepY + 160).toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`
    markerY += Math.sin(value * Math.PI * 2) * 24
  }

  return { path, markerX, markerY: clamp(markerY, 164, 314), startX, startY, endX, endY, displaySpan, distance }
}

async function localDataUri(path: string, mime: string) {
  try { return `data:${mime};base64,${(await readFile(join(process.cwd(), 'public', path))).toString('base64')}` } catch { return '' }
}
async function remoteDataUri(url: string | null) {
  if (!url) return ''
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return ''
    return `data:${response.headers.get('content-type') || 'image/png'};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
  } catch { return '' }
}

async function loadSharpWithBundledFont(): Promise<typeof import('sharp').default> {
  const fontPath = join(process.cwd(), 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og', 'Geist-Regular.ttf')
  const configDir = join(tmpdir(), 'slipsurge-nfl-fontconfig')
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
  <alias><family>GeistReplay</family><prefer><family>Geist</family></prefer></alias>
</fontconfig>`)
  process.env.FONTCONFIG_FILE = configPath
  process.env.FONTCONFIG_PATH = configDir
  const sharpFactory: typeof import('sharp').default = (await import('sharp')).default
  sharpFactory.cache(false)
  sharpFactory.concurrency(1)
  return sharpFactory
}

function marketTitle(quote: NflTouchdownMarketQuote) {
  if (quote.propType === 'first_td') return 'FIRST TD'
  if (quote.propType === 'anytime_td') {
    if ((quote.line ?? .5) > 2) return '3+ TD'
    if ((quote.line ?? .5) > .5) return '2+ TD'
    return 'ANYTIME TD'
  }
  return quote.label.toUpperCase().replace('ANYTIME ', '')
}

function quoteRelevant(event: NflTouchdownEvent, quote: NflTouchdownMarketQuote) {
  if (quote.propType === 'first_td') return event.isFirstTdOfGame
  if (quote.propType === 'anytime_td') {
    const threshold = (quote.line ?? .5) > 2 ? 3 : (quote.line ?? .5) > .5 ? 2 : 1
    return threshold <= event.playerTdNumber
  }
  if (quote.propType === `anytime_td_${event.quarter}q`) return true
  if (event.quarter <= 2 && quote.propType === 'anytime_td_1h') return true
  if (event.quarter >= 3 && quote.propType === 'anytime_td_2h') return true
  return false
}

function selectedQuotes(event: NflTouchdownEvent) {
  return event.marketQuotes.filter(quote => quoteRelevant(event, quote)).sort((a, b) => {
    const priority = (quote: NflTouchdownMarketQuote) => (quote.vendor === 'fanduel' ? 0 : 10 + Math.max(0, BOOK_ORDER.indexOf(quote.vendor)))
      + (quote.propType === 'first_td' ? 0 : quote.propType === 'anytime_td' && (quote.line ?? .5) <= .5 ? 1 : quote.propType.includes(`${event.quarter}q`) ? 2 : 3)
    return priority(a) - priority(b)
  }).filter((quote, index, all) => index === all.findIndex(candidate => marketTitle(candidate) === marketTitle(quote))).slice(0, 4)
}

async function buildAssets(event: NflTouchdownEvent): Promise<Assets> {
  const books: Record<string, string> = {}
  await Promise.all(Object.entries(BOOK_ASSETS).map(async ([key, asset]) => { books[key] = await localDataUri(asset.path, asset.mime) }))
  const [brand, headshot, teamLogo, opponentLogo] = await Promise.all([
    localDataUri('logo.png', 'image/png'), remoteDataUri(event.headshot), remoteDataUri(event.teamLogo), remoteDataUri(event.opponentLogo),
  ])
  return { brand, headshot, teamLogo, opponentLogo, books }
}

function quoteCards(event: NflTouchdownEvent, assets: Assets) {
  const quotes = selectedQuotes(event)
  if (!quotes.length) return `<rect x="626" y="354" width="292" height="118" rx="18" fill="#0a1118" stroke="#fff" stroke-opacity=".1"/><text x="646" y="381" class="meta">PREGAME TD MARKETS</text><text x="646" y="414" class="oddsEmpty">${event.kind === 'defense' ? 'DEFENSIVE TOUCHDOWN' : 'NO PLAYER PRICE CAPTURED'}</text><text x="646" y="439" class="muted">${event.kind === 'defense' ? 'No individual scorer market was offered.' : 'The archived board had no matching quote.'}</text>`
  return quotes.map((quote, index) => {
    const x = 626 + (index % 2) * 149
    const y = 354 + Math.floor(index / 2) * 62
    const asset = BOOK_ASSETS[quote.vendor]
    const logo = assets.books[quote.vendor]
    return `<rect x="${x}" y="${y}" width="141" height="54" rx="14" fill="#0a1118" stroke="#fff" stroke-opacity=".1"/>${logo ? `<image href="${logo}" x="${x + 10}" y="${y + 10}" width="25" height="25" preserveAspectRatio="xMidYMid meet"/>` : ''}<text x="${x + 42}" y="${y + 17}" class="book">${esc(asset?.label ?? quote.vendor.toUpperCase())}</text><text x="${x + 42}" y="${y + 38}" class="price">${american(quote.odds)}</text><text x="${x + 132}" y="${y + 17}" text-anchor="end" class="market">${esc(marketTitle(quote))}</text>${quote.openingOdds != null && quote.openingOdds !== quote.odds ? `<text x="${x + 132}" y="${y + 39}" text-anchor="end" class="open">OPEN ${american(quote.openingOdds)}</text>` : ''}`
  }).join('')
}

function frameSvg(event: NflTouchdownEvent, progress: number, assets: Assets) {
  const accent = event.teamColor || '#a3ff3f'
  const route = scoringPath(event, progress)
  const routeProgress = ease(clamp(progress, 0, 1))
  const yardLines = Array.from({ length: 6 }, (_, index) => {
    const x = 66 + (index / 5) * 490
    const yardsToGoal = Math.round(route.displaySpan * (1 - (index / 5)))
    return `<line x1="${x.toFixed(1)}" y1="145" x2="${x.toFixed(1)}" y2="333" stroke="#fff" stroke-opacity=".13"/><text x="${x.toFixed(1)}" y="172" text-anchor="middle" class="yard">${yardsToGoal === 0 ? 'G' : yardsToGoal}</text>`
  }).join('')
  const kind = event.kind === 'defense' ? 'DEFENSIVE TOUCHDOWN' : `${event.kind.toUpperCase()} TOUCHDOWN`
  const awayLogo = event.team === event.awayTeam ? assets.teamLogo : assets.opponentLogo
  const homeLogo = event.team === event.homeTeam ? assets.teamLogo : assets.opponentLogo
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <style>.brand{font:900 20px GeistReplay,Geist,sans-serif;fill:#fff}.brandSmall{font:800 9px GeistReplay,Geist,sans-serif;letter-spacing:1.8px;fill:#a3ff3f}.eyebrow{font:900 10px GeistReplay,Geist,sans-serif;letter-spacing:1.6px;fill:${accent}}.title{font:900 27px GeistReplay,Geist,sans-serif;fill:#fff}.meta{font:800 9px GeistReplay,Geist,sans-serif;letter-spacing:1.2px;fill:#78879a}.muted{font:650 10px GeistReplay,Geist,sans-serif;fill:#8492a5}.score{font:900 16px GeistReplay,Geist,sans-serif;fill:#fff}.yard{font:800 9px GeistReplay,Geist,sans-serif;fill:#fff;fill-opacity:.24}.book{font:800 7px GeistReplay,Geist,sans-serif;fill:#8898ac}.market{font:900 7px GeistReplay,Geist,sans-serif;fill:#a3ff3f}.price{font:900 17px GeistReplay,Geist,sans-serif;fill:#fff}.open{font:750 6px GeistReplay,Geist,sans-serif;fill:#718096}.oddsEmpty{font:900 15px GeistReplay,Geist,sans-serif;fill:#fff}</style>
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#101c18"/><stop offset=".42" stop-color="#070c11"/><stop offset="1" stop-color="#020407"/></linearGradient><linearGradient id="panel" x2="1" y2="1"><stop stop-color="#111a22"/><stop offset="1" stop-color="#070c12"/></linearGradient><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#fff" stroke-opacity=".025"/></pattern><filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><clipPath id="head"><rect x="646" y="155" width="92" height="92" rx="20"/></clipPath></defs>
    <rect width="960" height="540" fill="url(#bg)"/><rect width="960" height="540" fill="url(#grid)"/><circle cx="50" cy="-20" r="230" fill="#a3ff3f" fill-opacity=".045"/><circle cx="900" cy="120" r="260" fill="${accent}" fill-opacity=".05"/>
    <rect x="24" y="20" width="912" height="72" rx="20" fill="#080e13" stroke="#fff" stroke-opacity=".1"/>${assets.brand ? `<image href="${assets.brand}" x="39" y="32" width="46" height="46"/>` : ''}<text x="96" y="51" class="brand">SlipSurge</text><text x="96" y="70" class="brandSmall">TOUCHDOWN REPLAY</text>
    ${awayLogo ? `<image href="${awayLogo}" x="405" y="36" width="36" height="36"/>` : ''}<text x="451" y="54" class="score">${esc(event.awayTeam)} ${event.awayScore}</text><text x="526" y="54" class="muted">AT</text><text x="552" y="54" class="score">${esc(event.homeTeam)} ${event.homeScore}</text>${homeLogo ? `<image href="${homeLogo}" x="638" y="36" width="36" height="36"/>` : ''}<text x="908" y="50" text-anchor="end" class="score">Q${event.quarter} · ${esc(event.clock)}</text><text x="908" y="70" text-anchor="end" class="meta">${event.isFirstTdOfGame ? 'FIRST TD OF GAME' : `PLAYER TD #${event.playerTdNumber}`}</text>
    <rect x="24" y="108" width="582" height="364" rx="24" fill="url(#panel)" stroke="#fff" stroke-opacity=".1"/><text x="48" y="132" class="eyebrow">${esc(kind)}${event.yards != null ? ` · ${event.yards} YARDS` : ''}</text>
    <rect x="42" y="145" width="538" height="188" rx="10" fill="#143d24" stroke="#78e294" stroke-opacity=".42"/><rect x="42" y="145" width="24" height="188" fill="#12283a"/><rect x="556" y="145" width="24" height="188" fill="#3b2410"/>${yardLines}<line x1="${route.startX}" y1="145" x2="${route.startX}" y2="333" stroke="#a3ff3f" stroke-width="2" stroke-opacity=".7" stroke-dasharray="4 5"/><text x="${Math.max(78, route.startX - 6)}" y="321" text-anchor="end" class="yard">LOS</text><text x="568" y="321" text-anchor="middle" class="yard">END ZONE</text>
    <path d="${route.path}" pathLength="1" fill="none" stroke="#ff9d42" stroke-opacity=".18" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${routeProgress.toFixed(4)} 1" filter="url(#glow)"/><path d="${route.path}" pathLength="1" fill="none" stroke="#ff9d42" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${routeProgress.toFixed(4)} 1"/><circle cx="${route.markerX.toFixed(1)}" cy="${route.markerY.toFixed(1)}" r="7" fill="#ff9d42" stroke="#fff" stroke-width="2" filter="url(#glow)"/>
    <text x="48" y="365" class="meta">${route.distance}-YARD SCORING PATH · NORMALIZED TOWARD END ZONE</text><text x="48" y="393" class="title">${esc(compact(event.text, 45))}</text><text x="48" y="424" class="muted">${event.passerName ? `PASSER · ${esc(event.passerName)}   •   ` : ''}${esc(event.team)} vs ${esc(event.opponent)}</text>
    <rect x="626" y="108" width="292" height="226" rx="24" fill="url(#panel)" stroke="#fff" stroke-opacity=".1"/><rect x="646" y="155" width="92" height="92" rx="20" fill="${accent}" fill-opacity=".28" stroke="${accent}" stroke-opacity=".65"/>${assets.headshot ? `<image href="${assets.headshot}" x="646" y="155" width="92" height="92" preserveAspectRatio="xMidYMax meet" clip-path="url(#head)"/>` : ''}${assets.teamLogo ? `<circle cx="728" cy="239" r="17" fill="#071018" stroke="#fff" stroke-opacity=".15"/><image href="${assets.teamLogo}" x="716" y="227" width="24" height="24"/>` : ''}<text x="646" y="135" class="eyebrow">SCORING RECEIPT</text><text x="758" y="177" class="meta">${esc(event.position ?? event.team)} · ${esc(event.team)}</text><text x="758" y="210" class="title" style="font-size:${event.playerName.length > 20 ? 19 : 22}px">${esc(compact(event.playerName, 23))}</text><text x="758" y="235" class="muted">${esc(kind)}</text><rect x="646" y="270" width="252" height="42" rx="12" fill="${accent}" fill-opacity=".1" stroke="${accent}" stroke-opacity=".3"/><text x="662" y="287" class="meta">SCORE AFTER PLAY</text><text x="882" y="298" text-anchor="end" class="score">${event.awayScore}–${event.homeScore}</text>
    ${quoteCards(event, assets)}
    <rect x="24" y="492" width="912" height="2" rx="1" fill="#fff" fill-opacity=".07"/><rect x="24" y="492" width="${912 * progress}" height="2" rx="1" fill="#a3ff3f" filter="url(#glow)"/><text x="24" y="519" class="brandSmall">SLIPSURGE.COM</text><text x="936" y="519" text-anchor="end" class="muted">${esc(event.gameDate)} · ${esc(event.gameStatus)}</text>
  </svg>`)
}

export async function renderNflTouchdownReplayGif(event: NflTouchdownEvent) {
  const assets = await buildAssets(event)
  if (!assets.brand) throw new Error('SlipSurge brand logo is unavailable; refusing to render an unbranded replay.')
  const sharp = await loadSharpWithBundledFont()
  const encoder = GIFEncoder()
  for (let index = 0; index < FRAMES; index += 1) {
    const rgba = await sharp(frameSvg(event, index / (FRAMES - 1), assets)).ensureAlpha().raw().toBuffer()
    const palette = quantize(rgba, 192, { format: 'rgb444' })
    const indexed = applyPalette(rgba, palette, 'rgb444')
    encoder.writeFrame(indexed, WIDTH, HEIGHT, { palette, delay: Math.round(1000 / FPS), repeat: 0 })
  }
  encoder.finish()
  return Buffer.from(encoder.bytes())
}
