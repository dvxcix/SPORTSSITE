import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { JSDOM } from 'jsdom'
import postcss from 'postcss'

// Import artwork as data. Never run the handoff's generator or embed SVG markup in React.
export function stillSvg(source) {
  const doc = new JSDOM(source, { contentType: 'image/svg+xml' }).window.document
  for (const node of doc.querySelectorAll('animate, animateTransform, animateMotion, set')) node.remove()
  for (const node of doc.querySelectorAll('style')) {
    const css = postcss.parse(node.textContent)
    css.walkAtRules(rule => { if (/keyframes$/i.test(rule.name)) rule.remove() })
    css.walkDecls(decl => { if (/^(?:-webkit-)?(?:animation|transition)(?:-|$)/i.test(decl.prop)) decl.remove() })
    node.textContent = css.toString()
  }
  return doc.documentElement.outerHTML
}

export function validateSvg(source) {
  const doc = new JSDOM(source, { contentType: 'image/svg+xml' }).window.document
  if (doc.documentElement.localName !== 'svg' || doc.documentElement.getAttribute('viewBox') !== '-120 -120 240 240') throw new Error('Unexpected SVG geometry')
  if (doc.querySelector('script, foreignObject, iframe, image, use, a')) throw new Error('SVG contains executable or externally referenced content')
  for (const node of doc.querySelectorAll('*')) for (const attr of node.attributes) {
    if (/^on/i.test(attr.name) || /href$/i.test(attr.name) && !attr.value.startsWith('#')) throw new Error('Unsafe SVG attribute')
  }
  if (/@import|url\(\s*['"]?(?!#)/i.test(source)) throw new Error('External SVG resource')
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const input = process.argv[2]
  if (!input) throw new Error('Pass the local handoff directory')
  const manifest = JSON.parse(await fs.readFile(path.join(input, 'decorations.json'), 'utf8'))
  if (manifest.decorations.length !== 50) throw new Error('Expected the complete 50-item handoff')
  const entries = []
  const provenance = []
  for (const item of manifest.decorations) {
    if (!/^(fb|bb|bs|ss)-[a-z]+$/.test(item.id) || item.file !== `svg/${item.id}.svg`) throw new Error('Unexpected asset path')
    const original = await fs.readFile(path.join(input, item.file), 'utf8')
    validateSvg(original)
    for (const [variant, content] of [['animated', original], ['still', stillSvg(original)]]) {
      const target = path.join('public/avatar-decorations', variant)
      await fs.mkdir(target, { recursive: true })
      await fs.writeFile(path.join(target, `${item.id}.svg`), content)
    }
    entries.push({ id: item.id, name: item.name, sport: item.sport })
    provenance.push({ id: item.id, bytes: Buffer.byteLength(original), sha256: crypto.createHash('sha256').update(original).digest('hex') })
  }
  await fs.writeFile('src/lib/avatarDecorations.json', JSON.stringify(entries, null, 2) + '\n')
  await fs.writeFile('docs/design/avatar-decoration-provenance-2026-11-21.json', JSON.stringify({ owner: 'SlipSurge', source: 'Owner-supplied Claude handoff, 2026-11-21', artboard: manifest.artboard, originals: provenance }, null, 2) + '\n')
  console.log(`Imported ${entries.length} checked originals and animation-free still variants.`)
}
