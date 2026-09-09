import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { nflPrimaryMarket } from '../src/lib/nflPrimaryMarket.ts'
import type { NflOddsPlayer, NflPlayerMarket } from '../src/lib/nflOddsTypes.ts'

function market(line: number, price: number, vendor = 'fanduel', propType = 'receiving_yards'): NflPlayerMarket {
  return { key: propType + ':' + line, propType, label: propType, category: 'receiving', line,
    offers: [{ vendor, line, openingLine: line, type: 'over_under', current: { over: price }, opening: null, updatedAt: null }] }
}
function player(markets: NflPlayerMarket[]): NflOddsPlayer {
  return { id: 1, name: 'Test', team: 'NE', position: 'WR', markets }
}
test('primary columns resolve each player and book line instead of creating sparse threshold columns', () => {
  const row = player([market(20, -1000), market(60.5, -110), market(100, 500), market(65.5, -110, 'draftkings')])
  assert.equal(nflPrimaryMarket(row, 'receiving_yards', 'fanduel')?.line, 60.5)
  assert.equal(nflPrimaryMarket(row, 'receiving_yards', 'draftkings')?.line, 65.5)
  assert.equal(nflPrimaryMarket(row, 'receiving_yards', 'betmgm'), null)
  assert.equal(row.markets.length, 4, 'alternate markets must remain intact')
})
test('an ATD column never substitutes a 2+ touchdown price', () => {
  assert.equal(nflPrimaryMarket(player([market(2, -110, 'fanduel', 'anytime_td')]), 'anytime_td'), null)
  assert.equal(nflPrimaryMarket(player([market(1, 300, 'fanduel', 'anytime_td'), market(2, -110, 'fanduel', 'anytime_td')]), 'anytime_td')?.line, 1)
})
test('initial page never loads or serializes the archive', () => {
  const page = readFileSync(new URL('../src/app/the-sideline/page.tsx', import.meta.url), 'utf8')
  const data = readFileSync(new URL('../src/app/the-sideline/data.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /history=|getSidelineTimeline|getSidelineCapture/)
  assert.doesNotMatch(data, /loadHistoryPages|HISTORY_MAX_FRAMES/)
  assert.match(data, /select\('captured_at'\)/)
  assert.match(data, /lte\('captured_at', capturedAt\)/)
})
test('NFL preview stays out of navigation', () => {
  for (const file of ['Sidebar.tsx', 'MobileDock.tsx', 'DesktopCommandBar.tsx']) {
    const source = readFileSync(new URL('../src/components/layout/' + file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /href: ?['"]\/the-sideline/)
  }
})
