import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMgmHrFixture } from '../src/lib/scrapers/mgmCds.ts'

test('parses current explicit 1+ and 2+ MGM home-run markets', () => {
  const scrapes = parseMgmHrFixture({
    id: 'fixture-1',
    optionMarkets: [
      { name: { value: 'Bobby Witt Jr. to hit 1+ home runs' }, status: 'Visible', options: [{ name: { value: 'Yes' }, price: { americanOdds: 475 } }] },
      { name: { value: 'Bobby Witt Jr. to hit 2+ home runs' }, status: 'Visible', options: [{ name: { value: 'Yes' }, price: { americanOdds: 3500 } }] },
      { name: { value: 'Nick Loftin to hit 1+ home runs' }, status: 'Visible', options: [{ name: { value: 'Yes' }, price: { americanOdds: 800 } }] },
    ],
  }, '2026-09-07T12:00:00.000Z')

  assert.deepEqual(scrapes.map(scrape => [scrape.threshold, scrape.outcome_count]), [['1+', 2], ['2+', 1]])
  assert.deepEqual(scrapes[0].outcomes, [
    { player_name: 'Bobby Witt Jr.', avg_hr_per_game: null, odds: '+475' },
    { player_name: 'Nick Loftin', avg_hr_per_game: null, odds: '+800' },
  ])
})

test('parses conventional player home-run markets and ignores suspended prices', () => {
  const scrapes = parseMgmHrFixture({
    optionMarkets: [
      { name: { value: 'Mike Trout: Home runs' }, status: 'Visible', options: [{ name: { value: 'Over 0.5' }, price: { americanOdds: 625 } }] },
      { name: { value: 'Adley Rutschman: Home runs' }, status: 'Visible', options: [{ name: { value: 'Over 1.5' }, price: { americanOdds: 4500 } }] },
      { name: { value: 'Angel Genao: Home runs' }, status: 'Suspended', options: [{ name: { value: 'Over 0.5' }, price: { americanOdds: 950 } }] },
    ],
  })

  assert.equal(scrapes.find(scrape => scrape.threshold === '1+')?.outcomes[0].player_name, 'Mike Trout')
  assert.equal(scrapes.find(scrape => scrape.threshold === '2+')?.outcomes[0].player_name, 'Adley Rutschman')
  assert.equal(scrapes.some(scrape => scrape.outcomes.some(outcome => outcome.player_name === 'Angel Genao')), false)
})

