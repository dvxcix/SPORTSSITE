import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/dugout/DugoutClient.tsx', import.meta.url), 'utf8')

test('The Dugout ships the complete responsive UI contract', () => {
  const required = [
    'dugout-command-bar',
    'dugout-game-picker-filters',
    'Jump views',
    'player inspector',
    'th[data-col-key^=fhr_]',
    'dg-player-name{font-size:12px',
    'Multi-sort on. Select headers',
    'dugout-intelligence-strip',
    'Jump only · your saved order never changes',
    "(['start', 'home', 'away', 'end'] as const)",
    'dugout-compare-tray',
    'dugout-market-snapshot',
    'ss:dugout-view-v1:',
    '@media(max-width:640px)',
  ]
  for (const marker of required) assert.ok(source.includes(marker), `missing responsive contract marker: ${marker}`)
})

test('team banners do not duplicate the board controls', () => {
  assert.equal(source.split('{modeButtons}').length - 1, 1)
})

test('jump views never write member column preferences', () => {
  const start = source.indexOf('const scrollToMarketSection')
  const end = source.indexOf('useEffect(() =>', start)
  const jumpImplementation = source.slice(start, end)
  assert.ok(start > 0 && end > start)
  assert.equal(jumpImplementation.includes('saveColumnPrefs'), false)
  assert.equal(jumpImplementation.includes('setColumnPrefsState'), false)
})
