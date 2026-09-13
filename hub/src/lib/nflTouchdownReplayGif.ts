import type { NflTouchdownEvent } from '@/lib/nflTouchdownFeed'

const WIDTH = 960
const HEIGHT = 540
const FRAMES = 24
const FPS = 12

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!))
}

function ease(value: number) { return 1 - ((1 - value) ** 3) }

function word(value: number) { return Buffer.from([value & 255, (value >> 8) & 255]) }

function palette332() {
  const palette = Buffer.alloc(256 * 3)
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = Math.round(((index >> 5) & 7) * 255 / 7)
    palette[index * 3 + 1] = Math.round(((index >> 2) & 7) * 255 / 7)
    palette[index * 3 + 2] = (index & 3) * 85
  }
  return palette
}

function lzw(indices: Uint8Array) {
  const clear = 256
  const end = 257
  let codeSize = 9
  let nextCode = 258
  let dictionary = new Map<string, number>()
  const bytes: number[] = []
  let bits = 0
  let bitCount = 0
  const emit = (code: number) => {
    bits |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) { bytes.push(bits & 255); bits >>>= 8; bitCount -= 8 }
  }
  const reset = () => { dictionary = new Map(); codeSize = 9; nextCode = 258 }
  emit(clear)
  let prefix = indices[0] ?? 0
  for (let index = 1; index < indices.length; index += 1) {
    const symbol = indices[index]
    const key = `${prefix},${symbol}`
    const known = dictionary.get(key)
    if (known != null) { prefix = known; continue }
    emit(prefix)
    if (nextCode < 4096) {
      dictionary.set(key, nextCode++)
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1
    } else { emit(clear); reset() }
    prefix = symbol
  }
  emit(prefix)
  emit(end)
  if (bitCount) bytes.push(bits & 255)
  const blocks: Buffer[] = []
  for (let offset = 0; offset < bytes.length; offset += 255) {
    const chunk = bytes.slice(offset, offset + 255)
    blocks.push(Buffer.from([chunk.length]), Buffer.from(chunk))
  }
  blocks.push(Buffer.from([0]))
  return Buffer.concat(blocks)
}

function gif(frames: Uint8Array[], width: number, height: number) {
  const chunks: Buffer[] = [Buffer.from('GIF89a'), word(width), word(height), Buffer.from([0xf7, 0, 0]), palette332(), Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0'), Buffer.from([3, 1, 0, 0, 0])]
  const delay = Math.max(1, Math.round(100 / FPS))
  for (const frame of frames) {
    chunks.push(Buffer.from([0x21, 0xf9, 4, 4]), word(delay), Buffer.from([0, 0]), Buffer.from([0x2c]), word(0), word(0), word(width), word(height), Buffer.from([0, 8]), lzw(frame))
  }
  chunks.push(Buffer.from([0x3b]))
  return Buffer.concat(chunks)
}

function frameSvg(event: NflTouchdownEvent, progress: number) {
  const startToGoal = event.startYardsToEndzone ?? event.yards ?? 20
  const endToGoal = event.endYardsToEndzone ?? 0
  const startX = 100 + ((100 - Math.max(0, Math.min(100, startToGoal))) / 100) * 760
  const endX = 100 + ((100 - Math.max(0, Math.min(100, endToGoal))) / 100) * 760
  const currentX = startX + ((endX - startX) * ease(progress))
  const pulse = 7 + Math.sin(progress * Math.PI * 6) * 2
  const yardLines = Array.from({ length: 11 }, (_, index) => {
    const x = 100 + index * 76
    const label = index === 0 || index === 10 ? '' : String(index <= 5 ? index * 10 : (10 - index) * 10)
    return `<line x1="${x}" y1="178" x2="${x}" y2="390" stroke="#fff" stroke-opacity=".14"/><text x="${x}" y="208" text-anchor="middle" class="yard">${label}</text><text x="${x}" y="374" text-anchor="middle" class="yard">${label}</text>`
  }).join('')
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <style>.brand{font:900 20px Arial,sans-serif;fill:#fff}.eyebrow{font:800 11px Arial,sans-serif;letter-spacing:2px;fill:#a3ff3f}.title{font:900 34px Arial,sans-serif;fill:#fff}.meta{font:700 15px Arial,sans-serif;fill:#aeb9c8}.clock{font:900 18px Arial,sans-serif;fill:#fff}.yard{font:800 10px Arial,sans-serif;fill:#fff;fill-opacity:.22}</style>
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#122017"/><stop offset=".48" stop-color="#071018"/><stop offset="1" stop-color="#020508"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect width="960" height="540" fill="url(#bg)"/><circle cx="90" cy="20" r="220" fill="#a3ff3f" fill-opacity=".055"/>
    <text x="42" y="49" class="brand">SlipSurge</text><text x="42" y="70" class="eyebrow">TOUCHDOWN REPLAY</text>
    <text x="918" y="50" text-anchor="end" class="clock">Q${event.quarter} · ${esc(event.clock)}</text><text x="918" y="72" text-anchor="end" class="meta">${esc(event.team)} ${event.awayScore}–${event.homeScore} ${esc(event.opponent)}</text>
    <rect x="42" y="100" width="876" height="342" rx="24" fill="#0a1414" stroke="#fff" stroke-opacity=".12"/>
    <rect x="76" y="178" width="808" height="212" rx="8" fill="#173f27" stroke="#73dd8d" stroke-opacity=".45"/>
    <rect x="76" y="178" width="24" height="212" fill="#0d2537"/><rect x="860" y="178" width="24" height="212" fill="#302011"/>
    ${yardLines}<path d="M${startX} 284 H${currentX}" stroke="#ff9a3d" stroke-width="7" stroke-linecap="round" stroke-dasharray="10 9" filter="url(#glow)"/>
    <circle cx="${startX}" cy="284" r="6" fill="#fff" fill-opacity=".65"/><circle cx="${currentX}" cy="284" r="${pulse}" fill="#ff9a3d" stroke="#fff" stroke-width="2" filter="url(#glow)"/>
    <text x="62" y="480" class="eyebrow">${esc(event.kind.toUpperCase())} TOUCHDOWN${event.yards != null ? ` · ${event.yards} YARDS` : ''}</text>
    <text x="62" y="516" class="title">${esc(event.playerName)}</text><text x="898" y="514" text-anchor="end" class="meta">${esc(event.text)}</text>
  </svg>`)
}

export async function renderNflTouchdownReplayGif(event: NflTouchdownEvent) {
  const sharp = (await import('sharp')).default
  sharp.cache(false)
  const width = 640
  const height = 360
  const frames: Uint8Array[] = []
  for (let index = 0; index < FRAMES; index += 1) {
    const { data } = await sharp(frameSvg(event, index / (FRAMES - 1))).resize(width, height).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const indexed = new Uint8Array(width * height)
    for (let pixel = 0, source = 0; pixel < indexed.length; pixel += 1, source += 3) indexed[pixel] = (data[source] & 0xe0) | ((data[source + 1] & 0xe0) >> 3) | (data[source + 2] >> 6)
    frames.push(indexed)
  }
  return gif(frames, width, height)
}
