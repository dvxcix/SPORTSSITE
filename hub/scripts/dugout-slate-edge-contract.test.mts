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
  assert.match(dugout, /computeDugoutMomentum\(pool\)/)
  assert.match(dugout, /entriesByWindow=\{slateEdgeEntriesByWindow\}/)
  assert.match(dugout, /onWindowChange=\{setStatcastWindow\}/)
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
  assert.match(overlay, /Slate Edge data window/)
  assert.match(overlay, /windowSignalLeaders/)
  assert.match(overlay, /Leader · all windows/)
  assert.match(overlay, /BatterCharge/)
  assert.match(overlay, /src="\/logo\.png"/)
  assert.match(overlay, /GameMatchupMark/)
  assert.match(overlay, /aria-label=\{item\.awayAbbr \+ ' at ' \+ item\.homeAbbr\}/)
  assert.match(overlay, /RankMark rank=\{index \+ 1\}/)
  assert.doesNotMatch(overlay, /styles\.gameTeam/)
})

test('Slate Edge is responsive and uses the shared accessible modal', () => {
  assert.match(overlay, /<ModalSurface/)
  assert.match(overlay, /labelledBy="slate-edge-title"/)
  assert.match(styles, /@media \(max-width: 900px\)/)
  assert.match(styles, /@media \(max-width: 560px\)/)
  assert.match(styles, /\.mobileRankingList/)
  assert.match(styles, /\.tableWrap \{ display: none; \}/)
  assert.match(styles, /\.gameMatchupMark/)
  assert.match(styles, /\.rankMark/)
  assert.match(styles, /--se-muted: #a8b3c4/)
  assert.match(styles, /prefers-reduced-motion/)
})
