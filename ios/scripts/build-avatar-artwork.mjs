import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const requireHub = createRequire(new URL('../../hub/package.json', import.meta.url))
const sharp = requireHub('sharp')
const source = new URL('../../hub/public/avatar-decorations/', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('../../hub/src/lib/avatarDecorations.json', import.meta.url), 'utf8'))
const atlasSize = 320
const columns = 8
const rows = Math.ceil(catalog.length / columns)
const output = new URL('../SlipSurge/', import.meta.url)

const art = await Promise.all(catalog.map(async (entry, index) => {
  if (!/^[a-z0-9-]+$/.test(entry.id)) throw new Error('Invalid avatar decoration ID')
  const still = await readFile(new URL(`still/${entry.id}.svg`, source))
  const preview = await readFile(new URL(`animated/${entry.id}.svg`, source), 'utf8')
  assert.match(preview, /<svg [^>]+viewBox="-120 -120 240 240"/)
  assert.doesNotMatch(preview, /<script|<foreignObject/i)
  return {
    tile: {
      input: await sharp(still, { density: 96 }).resize(atlasSize, atlasSize).png().toBuffer(),
      left: index % columns * atlasSize,
      top: Math.floor(index / columns) * atlasSize,
    },
    entry: { ...entry, preview },
  }
}))

const atlas = await sharp({ create: {
  width: columns * atlasSize, height: rows * atlasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 },
} }).composite(art.map(item => item.tile)).png({ compressionLevel: 9 }).toBuffer()

const files = [
  [new URL('Assets.xcassets/AvatarDecorations.imageset/atlas.png', output), atlas],
  [new URL('AvatarDecorations.json', output), Buffer.from(JSON.stringify({ atlasSize, columns, items: art.map(item => item.entry) }) + '\n')],
]
await Promise.all(files.map(async ([url, generated]) => {
  if (process.argv.includes('--check')) {
    assert((await readFile(url)).equals(generated), `Regenerate ${url.pathname}`)
  } else {
    await writeFile(url, generated)
  }
}))
