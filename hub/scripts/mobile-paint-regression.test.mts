import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const dugout = readFileSync(new URL('../src/components/dugout/DugoutClient.tsx', import.meta.url), 'utf8')
const player = readFileSync(new URL('../src/components/dugout/PlayerRow.module.css', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
test('Dugout and Recap avoid collapsed borders with sticky player cells', () => {
  const tables = dugout.split('\n').filter(line => line.includes('<table') && line.includes('dugout-dense-table'))
  assert.equal(tables.length, 2)
  for (const table of tables) {
    assert.match(table, /borderCollapse: 'separate'/)
    assert.match(table, /borderSpacing: 0/)
  }
})
test('touch paint isolation is shared by both pages, without row virtualization', () => {
  assert.match(player, /@media\(any-pointer:coarse\)/)
  assert.match(player, /content-visibility:visible;contain:none/)
  assert.match(player, /transform:translateZ\(0\)/)
})
test('42px profile treatment hides profile copy as well as chevron', () => {
  const compact = css.slice(css.indexOf('.ss-topbar-profile-trigger { width: 42px'))
  assert.match(compact.slice(0, 650), /\.ss-topbar-profile-trigger \.ss-topbar-profile-copy \{ display: none !important; \}/)
})
