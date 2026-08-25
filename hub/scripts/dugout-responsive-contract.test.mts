import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { applyDugoutViewPreset, buildDugoutMarketTimeline } from '../src/lib/dugoutPresentation.ts'

const source = readFileSync(new URL('../src/components/dugout/DugoutClient.tsx', import.meta.url), 'utf8')

test('temporary presets preserve a member custom order and never reveal hidden columns', () => {
  const customized = [
    { key: 'hits', group: 'props' },
    { key: 'index', group: 'mechanics' },
    { key: 'hr', group: 'hr' },
    { key: 'picks', group: 'picks' },
  ]
  assert.deepEqual(applyDugoutViewPreset(customized, 'all'), customized)
  assert.deepEqual(applyDugoutViewPreset(customized, 'markets').map(column => column.key), ['hr', 'picks'])
  assert.deepEqual(applyDugoutViewPreset(customized, 'props').map(column => column.key), ['hits', 'picks'])
  assert.equal(applyDugoutViewPreset(customized, 'markets').some(column => column.key === 'fhr'), false)
})

test('market timeline rebuilds real compact deltas without synthetic points', () => {
  const timeline = buildDugoutMarketTimeline([
    { captured_at: '2026-08-25T12:00:00Z', prop_map: { p1: { name: 'Player One', fhr: { fanduel: '+1500' }, sa: { fanduel: 500 } } } },
    { captured_at: '2026-08-25T12:10:00Z', prop_map: { p1: { name: 'Player One', hits: { fanduel: -200 } } } },
    { captured_at: '2026-08-25T12:20:00Z', prop_map: { p1: { name: 'Player One', sa: { fanduel: 450 } }, p2: { name: 'Player Two', fhr: { fanduel: 2200 } } } },
  ])
  assert.equal(timeline.length, 2)
  assert.equal(timeline[0].players.get('player one')?.fhr, 1500)
  assert.equal(timeline[1].players.get('player one')?.fhr, 1500)
  assert.equal(timeline[1].players.get('player one')?.sa, 450)
  assert.equal(timeline[1].players.get('player two')?.fhr, 2200)
})

test('The Dugout renders the responsive interaction surfaces', () => {
  const required = [
    'dugout-command-bar',
    'dugout-game-picker-filters',
    'Board view',
    'player inspector',
    'data-col-group',
    'data-market-move',
    'dg-player-name{font-size:12px',
    'dugout-intelligence-strip',
    "(['start', 'home', 'away', 'end'] as const)",
    'dugout-compare-tray',
    'MARKET HISTORY',
    'ss:dugout-view-v1:',
    '@media(max-width:640px)',
  ]
  for (const marker of required) assert.ok(source.includes(marker), `missing responsive UI marker: ${marker}`)
})

test('team banners do not duplicate the board controls', () => {
  assert.equal(source.split('{modeButtons}').length - 1, 1)
})

test('presets never write member column preferences', () => {
  const start = source.indexOf('const renderedDugoutColumns')
  const end = source.indexOf('const [marketHistory', start)
  const presetImplementation = source.slice(start, end)
  assert.ok(start > 0 && end > start)
  assert.equal(presetImplementation.includes('saveColumnPrefs'), false)
  assert.equal(presetImplementation.includes('setColumnPrefsState'), false)
})
