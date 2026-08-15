import assert from 'node:assert/strict'
import { buildFanduelArchiveRows } from '../src/lib/scrapers/fanduelArchive.ts'

const context = { gameDate: '2026-08-15', gameKey: 'MIN@PHI', importedAt: '2026-08-15T18:00:01.000Z' }
const plateAppearance = {
  sportsbook: 'FanDuel',
  scraped_at: '2026-08-15T18:00:00.000Z',
  event: { event_id: '1234567', title: 'Minnesota Twins @ Philadelphia Phillies' },
  active_tab: { label: 'Plate Appearance' },
  sections: {
    '1st PA - J.T. Realmuto': [
      { selection: 'J.T. Realmuto - Single', odds: '+550', market_hint: '1st PA - J.T. Realmuto', parts: ['1st PA - J.T. Realmuto', 'Single'], aria_label: '1st PA - J.T. Realmuto, Single, +550', format: 'B' },
      { selection: 'J.T. Realmuto - Extra Base Hit (Double/Triple/Home Run)', odds: '+300', market_hint: '1st PA - J.T. Realmuto', parts: ['1st PA - J.T. Realmuto', 'Extra Base Hit (Double/Triple/Home Run)'], aria_label: '1st PA - J.T. Realmuto, Extra Base Hit (Double/Triple/Home Run), +300', format: 'B' },
      { selection: 'J.T. Realmuto - Walk / HBP', odds: '+425', market_hint: '1st PA - J.T. Realmuto', parts: ['1st PA - J.T. Realmuto', 'Walk / HBP'], aria_label: '1st PA - J.T. Realmuto, Walk / HBP, +425', format: 'B' },
    ],
  },
}

const playerCombos = {
  sportsbook: 'FanDuel',
  scraped_at: '2026-08-15T18:00:00.000Z',
  event: { event_id: '1234567', title: 'Minnesota Twins @ Philadelphia Phillies' },
  active_tab: { label: 'Player Combos' },
  sections: {
    'Players to Combine for a Home Run': [
      { selection: 'Kyle Schwarber & Brandon Marsh', odds: '+1200', parts: ['Players to Combine for a Home Run', 'Kyle Schwarber & Brandon Marsh'], aria_label: 'Players to Combine for a Home Run, Kyle Schwarber & Brandon Marsh, +1200', format: 'B' },
    ],
  },
}

const pa = buildFanduelArchiveRows(plateAppearance, context)
const combos = buildFanduelArchiveRows(playerCombos, context)
assert.equal(pa.capture.tab_label, 'Plate Appearance')
assert.equal(pa.capture.outcome_count, 3)
assert.equal(pa.outcomes.length, 3)
assert.equal(pa.outcomes[1].selection, 'J.T. Realmuto - Extra Base Hit (Double/Triple/Home Run)')
assert.equal(pa.outcomes[1].odds, 300)
assert.equal(combos.capture.tab_label, 'Player Combos')
assert.equal(combos.outcomes.length, 1)
assert.equal(combos.outcomes[0].selection, 'Kyle Schwarber & Brandon Marsh')
assert.notEqual(pa.capture.capture_key, combos.capture.capture_key)
assert.equal(
  buildFanduelArchiveRows(plateAppearance, context).capture.capture_key,
  pa.capture.capture_key,
  'reposting the same scrape must be idempotent',
)

console.log('fanduel archive regression passed')
