import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const requireHub = createRequire(new URL('../../hub/package.json', import.meta.url))
const source = new URL('../../hub/public/avatar-decorations/animated/', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('../../hub/src/lib/avatarDecorations.json', import.meta.url), 'utf8'))
const destination = new URL('../SlipSurge/', import.meta.url)
const size = 144
const columns = 8
const framesPerSecond = 24
const frameLimit = framesPerSecond * 12
const inputs = await Promise.all(catalog.map(async ({ id }) => {
  assert.match(id, /^[a-z0-9-]+$/)
  const svg = await readFile(new URL(`${id}.svg`, source), 'utf8')
  assert.match(svg, /<svg [^>]+viewBox="-120 -120 240 240"/)
  assert.doesNotMatch(svg, /<script|<foreignObject|<iframe/i)
  return { id, svg, sha256: digest(svg) }
}))

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex') }

const metadataURL = new URL('AvatarMotion.json', destination)
const spritesURL = new URL('AvatarMotion.bin', destination)
if (process.argv.includes('--check')) {
  const [raw, sprites] = await Promise.all([readFile(metadataURL, 'utf8'), readFile(spritesURL)])
  const metadata = JSON.parse(raw)
  assert.equal(metadata.hash, digest(sprites))
  assert.equal(metadata.framesPerSecond, framesPerSecond)
  assert.deepEqual(Object.keys(metadata.items), inputs.map(({ id }) => id))
  for (const { id, sha256 } of inputs) {
    const item = metadata.items[id]
    assert.equal(item.sha256, sha256, `Regenerate ${id}`)
    assert.equal(item.frames, Math.min(frameLimit, Math.ceil(item.duration * 1000 * framesPerSecond / 1000)))
  }
} else {
  const { chromium } = requireHub('playwright-core')
  const sharp = requireHub('sharp')
  const browser = await chromium.launch()
  const rendered = new Array(inputs.length)
  try {
    const context = await browser.newContext({ viewport: { width: size, height: size }, reducedMotion: 'no-preference' })
    await context.route('**/*', route => route.abort())
    let next = 0
    await Promise.all(Array.from({ length: 5 }, async () => {
      const page = await context.newPage()
      try {
        while (next < inputs.length) {
          const index = next++
          rendered[index] = await render(page, inputs[index], sharp)
        }
      } finally { await page.close() }
    }))
  } finally { await browser.close() }

  let offset = 0
  const items = Object.fromEntries(rendered.map(({ id, bytes, ...entry }) => {
    const item = { ...entry, offset, length: bytes.length }
    offset += bytes.length
    return [id, item]
  }))
  const sprites = Buffer.concat(rendered.map(item => item.bytes))
  await Promise.all([
    writeFile(spritesURL, sprites),
    writeFile(metadataURL, JSON.stringify({ size, columns, framesPerSecond, hash: digest(sprites), items }) + '\n'),
  ])
}

async function render(page, { id, svg, sha256 }, sharp) {
  await page.setContent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body,svg{margin:0;display:block;width:100%;height:100%;background:transparent}</style>${svg}`)
  const duration = await page.evaluate(() => {
    const svg = document.querySelector('svg')
    svg.pauseAnimations()
    const cssPeriods = document.getAnimations().map(animation => {
      animation.pause()
      const timing = animation.effect.getTiming()
      return Number(timing.duration) * (timing.direction.startsWith('alternate') ? 2 : 1)
    })
    const svgPeriods = Array.from(svg.querySelectorAll('[dur]'), item => {
      const value = item.getAttribute('dur')
      return Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000)
    })
    const periods = [...cssPeriods, ...svgPeriods].filter(value => Number.isFinite(value) && value > 0)
    const longest = Math.max(1000, ...periods)
    for (let multiple = 1; longest * multiple <= Math.max(longest, 12_000); multiple++) {
      const candidate = longest * multiple
      if (periods.every(period => Math.abs(candidate / period - Math.round(candidate / period)) < 0.015)) return candidate
    }
    return longest
  })
  const frames = Math.min(frameLimit, Math.ceil(duration * framesPerSecond / 1000))
  const frameTime = duration / frames
  const tiles = []
  for (let frame = 0; frame < frames; frame++) {
    await page.evaluate(ms => {
      document.querySelector('svg').setCurrentTime(ms / 1000)
      for (const animation of document.getAnimations()) animation.currentTime = ms
    }, frame * frameTime + 0.01)
    tiles.push({ input: await page.screenshot({ omitBackground: true }), left: frame % columns * size, top: Math.floor(frame / columns) * size })
  }
  assert(tiles.some(tile => !tile.input.equals(tiles[0].input)), `${id} did not animate`)
  const bytes = await sharp({ create: {
    width: columns * size, height: Math.ceil(frames / columns) * size, channels: 4, background: '#00000000',
  } }).composite(tiles).webp({ quality: 81, alphaQuality: 100, effort: 4 }).toBuffer()
  return { id, bytes, frames, duration: duration / 1000, sha256 }
}
