import assert from 'node:assert/strict'
import test from 'node:test'
import { attachNflPikkitSnapshot, canonicalizeNflPikkitMarket, resolveNflPikkitEntry, type NflPikkitSnapshot } from '../src/lib/nflPikkit.ts'
import type { SidelineOddsBoard } from '../src/lib/nflOddsTypes.ts'
import { runPikkitScrape } from '../src/lib/scrapers/pikkitScraper.ts'

test('scraper preserves different NFL contracts for the same player', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const select = { value: 'player_touchdown', options: [{ value: 'player_touchdown', textContent: 'Touchdowns' }], dispatchEvent: () => true }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { title: 'NFL', querySelectorAll: () => [select], body: { innerText: 'Test Player Anytime Touchdown Scorer\n100 Picks\nTest Player First Touchdown Scorer\n25 Picks\nTest Player TDs\n80 Picks' } } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: 'https://app.pikkit.com/event/test' } })
  try {
    const capture = await runPikkitScrape()
    assert.deepEqual(capture.props.player_touchdown, { 'Test Player Anytime Touchdown Scorer': 100, 'Test Player First Touchdown Scorer': 25, 'Test Player TDs': 80 })
    const identities = [{ name: 'Test Player', team: 'NE', position: 'WR' }]
    const contracts = Object.keys(capture.props.player_touchdown).map(name => canonicalizeNflPikkitMarket('player_touchdown', resolveNflPikkitEntry(name, 'Touchdowns', identities)!.marketLabel))
    assert.deepEqual(contracts, ['anytime_td', 'first_td', 'tds'])
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation)
    else Reflect.deleteProperty(globalThis, 'location')
  }
})

test('NFL Pikkit labels map to Sideline prop keys without dropping unknown markets', () => {
  for (const label of ['First TD', '1st TD Scorer', '1st Touchdown', 'FTD']) assert.equal(canonicalizeNflPikkitMarket('player_touchdown', label), 'first_td')
  assert.equal(canonicalizeNflPikkitMarket('player_touchdown', 'TDs'), 'tds')
  assert.equal(canonicalizeNflPikkitMarket('player_touchdown', 'First Half TD'), 'anytime_td_1h')
  assert.equal(canonicalizeNflPikkitMarket('player_touchdown', 'Second Half TD'), 'anytime_td_2h')
  assert.equal(canonicalizeNflPikkitMarket('player_touchdown', 'Last Touchdown Scorer'), 'last_td')
  assert.equal(canonicalizeNflPikkitMarket('player_touchdown', 'Last TD'), 'last_td')
  assert.equal(canonicalizeNflPikkitMarket('player_touchdown', 'Total TDs'), 'total_tds')
  assert.equal(canonicalizeNflPikkitMarket('receiving', 'Long Rec.'), 'longest_reception')
  assert.equal(canonicalizeNflPikkitMarket('kicking', 'PAT Made'), 'extra_points')
  assert.equal(canonicalizeNflPikkitMarket('kicking', 'Kicking Pts.'), 'kicking_points')
  assert.equal(canonicalizeNflPikkitMarket('firstTouchdownScorer', 'First Touchdown Scorer'), 'first_td')
  assert.equal(canonicalizeNflPikkitMarket('atd', 'Anytime Touchdown Scorer'), 'anytime_td')
  assert.equal(canonicalizeNflPikkitMarket('two_tds', 'To Score 2+ Touchdowns'), 'two_plus_td')
  assert.equal(canonicalizeNflPikkitMarket('rush_rec', 'Rushing + Receiving Yards'), 'rushing_receiving_yards')
  assert.equal(canonicalizeNflPikkitMarket('custom-special', 'Quarterback Kneel Downs'), 'quarterback_kneel_downs')
  assert.equal(canonicalizeNflPikkitMarket('passing', 'Matthew Stafford Pass Yards'), 'passing_yards')
  assert.equal(canonicalizeNflPikkitMarket('passing', 'Pass Att.'), 'passing_attempts')
  assert.equal(canonicalizeNflPikkitMarket('passing', 'Pass Comp.'), 'passing_completions')
  assert.equal(canonicalizeNflPikkitMarket('rushing', 'Rush Att.'), 'rushing_attempts')
  assert.equal(canonicalizeNflPikkitMarket('kicking', 'Harrison Mevis FG Made'), 'field_goals_made')
})

test('touchdown section headings qualify bare names without overwriting other contracts', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const select = { value: 'player_touchdown', options: [{ value: 'player_touchdown', textContent: 'Touchdowns' }], dispatchEvent: () => true }
  const text = 'Anytime TD Scorer\n1,000 Picks\nTest Player\n700 Picks\nFirst TD Scorer\n300 Picks\nTest Player\n90 Picks\nLast TD Scorer\nTest Player\n40 Picks\nTDs\nTest Player TDs\n120 Picks\nTotal TDs\nTest Player\n30 Picks'
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { title: 'NFL', querySelectorAll: () => [select], body: { innerText: text } } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: 'https://app.pikkit.com/event/test' } })
  try {
    const capture = await runPikkitScrape()
    assert.deepEqual(capture.props.player_touchdown, {
      'Test Player Anytime TD Scorer': 700,
      'Test Player First TD Scorer': 90,
      'Test Player Last TD Scorer': 40,
      'Test Player TDs': 120,
      'Test Player Total TDs': 30,
    })
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation)
    else Reflect.deleteProperty(globalThis, 'location')
  }
})

test('broad NFL tabs resolve real players and reject market-total headings', () => {
  const identities = [{ name: 'Matthew Stafford', team: 'LA', position: 'QB' }, { name: 'Christian McCaffrey', team: 'SF', position: 'RB' }]
  assert.deepEqual(resolveNflPikkitEntry('Matthew Stafford Pass Yards', 'Passing', identities), {
    identity: identities[0],
    marketLabel: 'Pass Yards',
  })
  assert.deepEqual(resolveNflPikkitEntry('Christian McCaffrey', 'Receiving', identities), {
    identity: identities[1],
    marketLabel: 'Receiving Yards',
  })
  assert.equal(resolveNflPikkitEntry('Anytime TD Scorer', 'Touchdowns', identities), null)
  assert.equal(resolveNflPikkitEntry('Christian McCaffrey First Touchdown Scorer', 'Touchdowns', identities)?.marketLabel, 'First Touchdown Scorer')
  assert.equal(resolveNflPikkitEntry('Christian McCaffrey', 'First TD', identities)?.marketLabel, 'First Touchdown Scorer')
  assert.equal(resolveNflPikkitEntry('Christian McCaffrey', 'Last Touchdown', identities)?.marketLabel, 'Last Touchdown Scorer')
  assert.equal(resolveNflPikkitEntry('Christian McCaffrey', 'Total Touchdowns', identities)?.marketLabel, 'Total TDs')
  assert.equal(resolveNflPikkitEntry('Christian McCaffrey', 'First Half Touchdown', identities)?.marketLabel, 'First Half Touchdown')
})

test('Pikkit picks attach by normalized player and team identity', () => {
  const board: SidelineOddsBoard = {
    bdlGameId: 1,
    status: 'ready',
    capturedAt: '2026-09-09T16:00:00.000Z',
    source: 'snapshot',
    gameLines: [],
    players: [{ id: 15, name: 'Patrick Mahomes II', team: 'KC', position: 'QB', markets: [] }],
  }
  const snapshot: NflPikkitSnapshot = {
    gameId: 'game-1', gameDate: '2026-09-09', season: 2026, week: 1,
    awayTeam: 'KC', homeTeam: 'LAC', capturedAt: '2026-09-09T15:55:00.000Z', sourceUrl: null,
    markets: [{
      propType: 'passing_yards', label: 'Passing Yards', rawKey: 'passing_yards', rawLabel: 'Passing Yards',
      players: [{ playerName: 'Patrick Mahomes II', playerKey: 'patrickmahomesii', team: 'KC', position: 'QB', picks: 1234 }],
    }],
  }
  const enriched = attachNflPikkitSnapshot(board, snapshot)
  assert.equal(enriched.picksCapturedAt, snapshot.capturedAt)
  assert.equal(enriched.players[0].publicPicks?.[0]?.picks, 1234)
  assert.equal(enriched.players[0].publicPicks?.[0]?.propType, 'passing_yards')
})

test('missing Pikkit data remains unavailable rather than zero-filled', () => {
  const board: SidelineOddsBoard = {
    bdlGameId: 1, status: 'ready', capturedAt: null, source: 'live', gameLines: [],
    players: [{ id: 3, name: 'Test Player', team: 'BUF', position: 'WR', markets: [] }],
  }
  const enriched = attachNflPikkitSnapshot(board, null)
  assert.equal(enriched.picksCapturedAt, null)
  assert.deepEqual(enriched.players[0].publicPicks, [])
})

test('older abbreviated captures normalize again when attached to the board', () => {
  const board: SidelineOddsBoard = {
    bdlGameId: 1, status: 'ready', capturedAt: null, source: 'snapshot', gameLines: [],
    players: [{ id: 15, name: 'Patrick Mahomes II', team: 'KC', position: 'QB', markets: [] }],
  }
  const snapshot: NflPikkitSnapshot = {
    gameId: 'game-1', gameDate: '2026-09-09', season: 2026, week: 1,
    awayTeam: 'KC', homeTeam: 'LAC', capturedAt: '2026-09-09T15:55:00.000Z', sourceUrl: null,
    markets: [{
      propType: 'pass_att', label: 'Pass Att.', rawKey: 'passing', rawLabel: 'Pass Att.',
      players: [{ playerName: 'Patrick Mahomes II', playerKey: 'patrickmahomesii', team: 'KC', position: 'QB', picks: 765 }],
    }],
  }
  const enriched = attachNflPikkitSnapshot(board, snapshot)
  assert.equal(enriched.players[0].publicPicks?.[0]?.propType, 'passing_attempts')
  assert.equal(enriched.players[0].publicPicks?.[0]?.picks, 765)
})
