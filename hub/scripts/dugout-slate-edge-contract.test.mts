import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const dugout = readFileSync(join(root, 'src/components/dugout/DugoutClient.tsx'), 'utf8')
const overlay = readFileSync(join(root, 'src/components/dugout/SlateEdgeOverlay.tsx'), 'utf8')
const styles = readFileSync(join(root, 'src/components/dugout/SlateEdgeOverlay.module.css'), 'utf8')

test('Slate Edge is additive and reuses the existing Dugout payload', () => {
  assert.match(dugout, /SlateEdgeOverlay/)
  assert.match(dugout, /for \(const game of \(data\?\.games \?\? \[\]\)\)/)
  assert.doesNotMatch(overlay, /fetch\(/)
  assert.match(dugout, /if \(game\.locked\) continue/)
})

test('Slate Edge exposes all four full-slate analysis views', () => {
  for (const label of ['Slate Rankings', 'Matchup Lens', 'Model vs Market', 'Signal Lab']) {
    assert.ok(overlay.includes(label), `missing ${label}`)
  }
  assert.match(overlay, /onOpenPlayer/)
  assert.match(overlay, /Search player, team, or game/)
  assert.match(overlay, /className={styles\.gamePlayer}[\s\S]*EdgeMark/)
  assert.match(overlay, /className={styles\.mismatchMetrics}[\s\S]*EdgeMark/)
  assert.match(overlay, /className={styles\.signalTop}[\s\S]*EdgeMark/)
})

test('Slate Edge is responsive and uses the shared accessible modal', () => {
  assert.match(overlay, /<ModalSurface/)
  assert.match(overlay, /labelledBy="slate-edge-title"/)
  assert.match(styles, /@media \(max-width: 900px\)/)
  assert.match(styles, /@media \(max-width: 560px\)/)
  assert.match(styles, /prefers-reduced-motion/)
})
