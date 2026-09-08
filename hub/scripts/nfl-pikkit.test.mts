import assert from 'node:assert/strict'
import test from 'node:test'
import { attachNflPikkitSnapshot, canonicalizeNflPikkitMarket, resolveNflPikkitEntry, type NflPikkitSnapshot } from '../src/lib/nflPikkit.ts'
import type { SidelineOddsBoard } from '../src/lib/nflOddsTypes.ts'

test('NFL Pikkit labels map to Sideline prop keys without dropping unknown markets', () => {
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
  assert.equal(enriched.pikkitCapturedAt, snapshot.capturedAt)
  assert.equal(enriched.players[0].publicPicks?.[0]?.picks, 1234)
  assert.equal(enriched.players[0].publicPicks?.[0]?.propType, 'passing_yards')
})

test('missing Pikkit data remains unavailable rather than zero-filled', () => {
  const board: SidelineOddsBoard = {
    bdlGameId: 1, status: 'ready', capturedAt: null, source: 'live', gameLines: [],
    players: [{ id: 3, name: 'Test Player', team: 'BUF', position: 'WR', markets: [] }],
  }
  const enriched = attachNflPikkitSnapshot(board, null)
  assert.equal(enriched.pikkitCapturedAt, null)
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
