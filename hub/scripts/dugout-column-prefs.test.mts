import assert from 'node:assert/strict'
import test from 'node:test'
import { applyDugoutColumnPrefs } from '../src/lib/dugoutColumnPrefs.ts'

const columns = [
  { key: 'index', group: 'mechanics' },
  { key: 'picks', group: 'picks' },
  { key: 'fhr', group: 'fhr' },
  { key: 'hr', group: 'hr' },
  { key: 'hits', group: 'props' },
] as const

test('preserves an exact saved order across groups', () => {
  const prefs = { columnOrder: ['hits', 'index', 'hr', 'picks', 'fhr'] }
  assert.deepEqual(applyDugoutColumnPrefs(columns, prefs).map(column => column.key), prefs.columnOrder)
})

test('respects hidden groups and columns', () => {
  const resolved = applyDugoutColumnPrefs(columns, {
    hiddenGroups: ['fhr'], hiddenColumns: ['index'], columnOrder: ['fhr', 'index', 'hits', 'hr', 'picks'],
  })
  assert.deepEqual(resolved.map(column => column.key), ['hits', 'hr', 'picks'])
})

test('keeps future columns visible for older preferences', () => {
  const resolved = applyDugoutColumnPrefs(columns, { columnOrder: ['hr', 'picks'] })
  assert.deepEqual(resolved.map(column => column.key), ['hr', 'picks', 'index', 'fhr', 'hits'])
})

test('does not mutate preferences or canonical columns', () => {
  const prefs = { hiddenColumns: ['fhr'], columnOrder: ['hits', 'hr'] }
  const originalPrefs = structuredClone(prefs)
  const originalColumns = structuredClone(columns)
  applyDugoutColumnPrefs(columns, prefs)
  assert.deepEqual(prefs, originalPrefs)
  assert.deepEqual(columns, originalColumns)
})
