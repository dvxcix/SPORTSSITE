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
const MOTION_FRAMES = 16
const HOLD_FRAMES = 24

export type ContactRecapExportFormat = 'mp4' | 'gif'

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

function resultLabel(event: DailyContactEvent) {
  if (event.kind === 'home_run') return event.isGrandSlam ? 'GRAND SLAM' : `${Math.max(1, event.rbi)}-RUN HOME RUN`
  return event.result.replaceAll('_', ' ').toUpperCase()
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
  homeLogo: string
  awayLogo: string
  bookLogos: Record<string, string>
}

function quoteCards(quotes: ContactMarketQuote[], assets: FrameAssets, x: number, y: number) {
  const visible = quotes.slice(0, 6)
  if (!visible.length) {
    return `<rect x="${x}" y="${y}" width="484" height="68" rx="16" class="card"/><text x="${x + 18}" y="${y + 29}" class="meta">PREGAME CLOSE</text><text x="${x + 18}" y="${y + 51}" class="muted">No captured price for this result market</text>`
  }
  return visible.map((quote, index) => {
    const cardX = x + (index % 3) * 158
    const cardY = y + Math.floor(index / 3) * 64
    const logo = assets.bookLogos[quote.book]
    return `<rect x="${cardX}" y="${cardY}" width="148" height="54" rx="14" class="card"/>${logo ? `<image href="${logo}" x="${cardX + 10}" y="${cardY + 11}" width="31" height="31" preserveAspectRatio="xMidYMid meet"/>` : ''}<text x="${cardX + 50}" y="${cardY + 21}" class="book">${esc(quote.bookLabel)}</text><text x="${cardX + 50}" y="${cardY + 42}" class="price">${american(quote.odds)}</text>`
  }).join('')
}

function specialCards(quotes: ContactMarketQuote[], assets: FrameAssets, x: number, y: number, limit = 4) {
  return quotes.slice(0, limit).map((quote, index) => {
    const cardX = x + (index % 2) * 238
    const cardY = y + Math.floor(index / 2) * 52
    const logo = assets.bookLogos[quote.book]
    return `<rect x="${cardX}" y="${cardY}" width="226" height="43" rx="12" fill="#a3ff3f" fill-opacity=".075" stroke="#a3ff3f" stroke-opacity=".2"/>${logo ? `<image href="${logo}" x="${cardX + 10}" y="${cardY + 9}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>` : ''}<text x="${cardX + 42}" y="${cardY + 18}" class="specialLabel">${esc(quote.marketLabel)}</text><text x="${cardX + 42}" y="${cardY + 35}" class="specialPrice">${american(quote.odds)}</text>`
  }).join('')
}

function frameSvg(event: DailyContactEvent, rawProgress: number, assets: FrameAssets) {
  const progress = 1 - Math.pow(1 - rawProgress, 3)
  const park = MLB_PARK_SHAPES[event.game.parkTeamAbbr]
  const primary = getTeamColor(event.game.parkTeamAbbr)
  const secondary = getTeamSecondaryColor(event.game.parkTeamAbbr)
  const accent = event.kind === 'home_run' ? '#a3ff3f' : '#ff9f43'
  const controlY = Math.max(22, event.hcY - 78)
  const cx = 125 + (event.hcX - 125) * progress
  const cy = ((1 - progress) ** 2 * 203) + (2 * (1 - progress) * progress * controlY) + (progress ** 2 * event.hcY)
  const parkPath = park?.outfield ?? 'M125 220 L45 135 A105 105 0 0 1 205 135 Z'
  const parkTransform = park?.transform ? ` transform="${esc(park.transform)}"` : ''
  const badges = [
    event.isFirstHr ? 'FIRST HR' : '',
    event.isGrandSlam ? 'GRAND SLAM' : '',
    Number(event.exitVelocity) >= 110 ? 'LASER 110+' : Number(event.exitVelocity) >= 105 ? 'LASER 105+' : '',
    Number(event.distance) >= 420 ? 'MOONSHOT 420+' : '',
  ].filter(Boolean)
  const flightPath = `M125 203 Q${(125 + (event.hcX - 125) * .34).toFixed(1)} ${controlY.toFixed(1)} ${event.hcX.toFixed(1)} ${event.hcY.toFixed(1)}`
  const primaryQuotes = event.marketContext?.primary ?? []
  const specials = event.marketContext?.specials ?? []
  const badgeMarkup = badges.map((badge, index) => `<rect x="45" y="${552 + index * 29}" width="${Math.max(116, badge.length * 8 + 26)}" height="22" rx="11" fill="${accent}" fill-opacity=".11" stroke="${accent}" stroke-opacity=".35"/><text x="58" y="${568 + index * 29}" class="badge" fill="${accent}">${esc(badge)}</text>`).join('')
  const specialY = primaryQuotes.length > 3 ? 630 : 567
  const specialLimit = primaryQuotes.length > 3 ? 2 : 4

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <style>.eyebrow{font:800 13px Geist,sans-serif;letter-spacing:2.2px;fill:${accent}}.title{font:900 34px Geist,sans-serif;fill:#fff}.subtitle{font:650 15px Geist,sans-serif;fill:#9aa8bb}.body{font:650 14px Geist,sans-serif;fill:#d7dee8}.meta{font:800 10px Geist,sans-serif;letter-spacing:1.5px;fill:#718096}.muted{font:650 13px Geist,sans-serif;fill:#8290a3}.book{font:750 9px Geist,sans-serif;fill:#8190a3}.price{font:900 18px Geist,sans-serif;fill:#fff}.specialLabel{font:750 9px Geist,sans-serif;fill:#8fa0b4}.specialPrice{font:900 14px Geist,sans-serif;fill:#a3ff3f}.metricLabel{font:800 9px Geist,sans-serif;letter-spacing:1.4px;fill:#718096}.metricValue{font:900 21px Geist,sans-serif;fill:#fff}.badge{font:850 10px Geist,sans-serif;letter-spacing:1px}.score{font:850 15px Geist,sans-serif;fill:#fff}.brand{font:900 20px Geist,sans-serif;fill:#fff}.brandSmall{font:750 10px Geist,sans-serif;letter-spacing:1.7px;fill:#a3ff3f}.card{fill:#111820;stroke:#fff;stroke-opacity:.09}</style>
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#111b18"/><stop offset=".39" stop-color="#070c11"/><stop offset="1" stop-color="#020407"/></linearGradient><linearGradient id="panel" x2="1" y2="1"><stop stop-color="#10171d"/><stop offset="1" stop-color="#080d13"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern><clipPath id="avatar"><rect x="45" y="420" width="122" height="122" rx="24"/></clipPath></defs>
    <rect width="1280" height="720" fill="url(#bg)"/><rect width="1280" height="720" fill="url(#grid)"/><circle cx="140" cy="-30" r="250" fill="#a3ff3f" fill-opacity=".035"/>
    <rect x="28" y="24" width="1224" height="70" rx="20" fill="#080e13" stroke="#fff" stroke-opacity=".1"/>
    ${assets.brandLogo ? `<image href="${assets.brandLogo}" x="43" y="35" width="48" height="48"/>` : ''}<text x="102" y="53" class="brand">SlipSurge</text><text x="102" y="73" class="brandSmall">CONTACT RECAP</text>
    ${assets.awayLogo ? `<image href="${assets.awayLogo}" x="488" y="40" width="39" height="39"/>` : ''}<text x="541" y="55" class="score">${esc(event.game.awayTeam)} ${event.game.awayScore ?? '-'}</text><text x="632" y="55" class="muted">at</text><text x="666" y="55" class="score">${esc(event.game.homeTeam)} ${event.game.homeScore ?? '-'}</text>${assets.homeLogo ? `<image href="${assets.homeLogo}" x="756" y="40" width="39" height="39"/>` : ''}<text x="541" y="76" class="meta">GAME ${event.game.gameIndex + 1}  &#8226;  ${esc(event.game.venueName).toUpperCase()}</text>
    <text x="1220" y="53" text-anchor="end" class="brandSmall">${esc(event.gameDate)}</text><text x="1220" y="75" text-anchor="end" class="muted">SLIPSURGE.COM</text>
    <g transform="translate(235 78) scale(2.12)"><g${parkTransform}><path d="${esc(parkPath)}" fill="${primary}" fill-opacity=".32" stroke="${primary}" stroke-opacity=".9" stroke-width="1.65"/></g><path d="M163.9 166.7l-1-1c-5-16-20-27.7-37.7-27.7s-32.7 11.7-37.7 27.7l-1 1 32.7 32.7 6 6 6-6z" fill="${secondary}" fill-opacity=".72"/><path d="M125 203L28 106M125 203L222 106" stroke="#fff" stroke-opacity=".58" stroke-width=".7"/><path d="${flightPath}" pathLength="1" fill="none" stroke="${accent}" stroke-width="2.25" stroke-linecap="round" stroke-dasharray="${progress} 1" filter="url(#glow)"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rawProgress >= 1 ? 4.9 : 3.6}" fill="${accent}" stroke="#fff" stroke-width="1" filter="url(#glow)"/></g>
    <rect x="28" y="401" width="672" height="291" rx="26" fill="url(#panel)" fill-opacity=".97" stroke="#fff" stroke-opacity=".1"/>
    <rect x="45" y="420" width="122" height="122" rx="24" fill="${getTeamColor(event.batterTeam)}" fill-opacity=".45" stroke="${accent}" stroke-opacity=".55"/>${assets.headshot ? `<image href="${assets.headshot}" x="45" y="420" width="122" height="122" preserveAspectRatio="xMidYMax meet" clip-path="url(#avatar)"/>` : ''}${assets.batterLogo ? `<circle cx="154" cy="530" r="19" fill="#05090d" stroke="#fff" stroke-opacity=".14"/><image href="${assets.batterLogo}" x="141" y="517" width="26" height="26"/>` : ''}
    <text x="190" y="430" class="eyebrow">${esc(event.kind === 'home_run' ? 'HOME RUN FLIGHT' : 'NEAR HOME RUN FLIGHT')}</text><text x="190" y="472" class="title">${esc(event.batterName)}</text><text x="190" y="500" class="subtitle">${esc(event.batterTeam)}  &#8226;  ${esc(event.half)} ${event.inning ?? '-'}  &#8226;  off ${esc(event.pitcherName)}</text><text x="190" y="530" class="body">${esc(resultLabel(event))}</text>
    ${badgeMarkup}
    ${[['EXIT VELO', metric(event.exitVelocity, ' mph')], ['DISTANCE', metric(event.distance, ' ft')], ['LAUNCH', metric(event.launchAngle, '°')], ['PARKS', event.kind === 'near_hr' && event.parksHrCount != null ? `${event.parksHrCount}/30` : event.game.parkTeamAbbr]].map((item,index) => `<rect x="${190 + index * 119}" y="568" width="109" height="75" rx="15" fill="#0b1118" stroke="#fff" stroke-opacity=".08"/><text x="${204 + index * 119}" y="590" class="metricLabel">${item[0]}</text><text x="${204 + index * 119}" y="621" class="metricValue">${esc(item[1])}</text>`).join('')}
    <rect x="720" y="401" width="532" height="291" rx="26" fill="url(#panel)" fill-opacity=".98" stroke="#fff" stroke-opacity=".1"/>
    <text x="744" y="430" class="eyebrow">PREGAME MARKET RECEIPT</text><text x="744" y="454" class="subtitle">${esc(event.marketContext?.primaryLabel ?? 'Captured market')}  &#8226;  frozen before first pitch</text>
    ${quoteCards(primaryQuotes, assets, 744, 474)}
    ${specials.length ? `<text x="744" y="${specialY - 13}" class="meta">QUALIFYING MARKETS</text>${specialCards(specials, assets, 744, specialY, specialLimit)}` : ''}
  </svg>`)
}

async function buildAssets(event: DailyContactEvent, cache: Map<string, string>, brandLogo: string, bookLogos: Record<string, string>): Promise<FrameAssets> {
  const load = async (url?: string) => {
    if (!url) return ''
    if (!cache.has(url)) cache.set(url, await remoteDataUri(url))
    return cache.get(url) ?? ''
  }
  return {
    brandLogo, bookLogos,
    headshot: await load(mlbHeadshot(event.batterId)),
    batterLogo: await load(getTeamLogoPngUrl(event.batterTeam)),
    homeLogo: await load(getTeamLogoPngUrl(event.game.homeTeam)),
    awayLogo: await load(getTeamLogoPngUrl(event.game.awayTeam)),
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

export async function renderContactRecap(events: DailyContactEvent[], format: ContactRecapExportFormat) {
  const selected = events.slice(0, 60)
  if (!selected.length) throw new Error('There are no captured events to export.')
  const ffmpegPath = resolveFfmpegPath()
  const workDir = await mkdtemp(join(tmpdir(), 'slipsurge-contact-'))
  const sourcePath = join(workDir, 'source.mp4')
  const finalPath = format === 'mp4' ? sourcePath : join(workDir, 'recap.gif')
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
  const bookLogos: Record<string, string> = {}
  await Promise.all(Object.entries(BOOK_ASSETS).map(async ([book, asset]) => { bookLogos[book] = await localDataUri(asset.path, asset.mime) }))
  try {
    for (const event of selected) {
      const assets = await buildAssets(event, cache, brandLogo, bookLogos)
      let finalFrame: Buffer | null = null
      for (let index = 0; index < MOTION_FRAMES; index += 1) {
        const progress = index / (MOTION_FRAMES - 1)
        const frame = await sharp(frameSvg(event, progress, assets)).png({ compressionLevel: 3 }).toBuffer()
        finalFrame = frame
        await writeFrame(encoder.stdin, frame)
      }
      if (finalFrame) await writeFrame(encoder.stdin, finalFrame, HOLD_FRAMES)
    }
    encoder.stdin.end()
    const [exitCode] = await Promise.race([once(encoder, 'close'), spawnFailure]) as [number]
    if (exitCode !== 0) throw new Error(encoderFailureMessage(errors, `Video encoder exited with code ${exitCode}.`))
    if (format === 'gif') {
      const filters = 'fps=12,scale=960:-1:flags=lanczos'
      await runFfmpeg(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath, '-vf', `${filters},palettegen=max_colors=160:stats_mode=diff`, palettePath])
      await runFfmpeg(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath, '-i', palettePath, '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`, '-loop', '0', finalPath])
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
