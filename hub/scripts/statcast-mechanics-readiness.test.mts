import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateMechanicsReadiness, newestMechanicsAudit } from '../src/lib/statcastMechanicsReadiness.ts'
import type { StatcastIntegrityResult } from '../src/lib/statcastIntegrity.ts'

const gameDate = '2026-08-19'
const auditCreatedAt = '2026-08-19T10:20:00.000Z'
const requirements = [
  { mlbId: 1, pitcherHand: 'R' as const },
  { mlbId: 2, pitcherHand: 'L' as const },
]

function audit(overrides: Partial<StatcastIntegrityResult> = {}): StatcastIntegrityResult {
  return {
    id: 'audit-1',
    season: 2026,
    through_date: '2026-08-18',
    status: 'healthy',
    summary: { failures: 0, warnings: 0 },
    checks: {
      pitch_log: { raw_to_typed_gaps: {}, classification_mismatches: 0, terminal_events_without_description: 0, fair_balls_without_event: 0 },
      category_freshness: { stale_categories: 0 },
      official_schedule: { source_available: true, final_games: 15, final_games_without_pitch_log: 0, missing_game_pks: [] },
    },
    created_at: auditCreatedAt,
    ...overrides,
  }
}

const readyRows = [
  { mlb_id: 1, pitcher_hand: 'R', computed_at: '2026-08-19T10:25:00.000Z' },
  { mlb_id: 2, pitcher_hand: 'L', computed_at: '2026-08-19T10:25:00.000Z' },
]
const readyCategories = [
  'bat_tracking',
  'batted_ball_splits',
  'swing_path_attack_angle',
  'swing_timing_miss_distance',
].map(category => ({ category, last_synced_at: '2026-08-19T10:00:00.000Z' }))

test('defers until the exact through-yesterday audit exists', () => {
  const result = evaluateMechanicsReadiness({ gameDate, currentDate: gameDate, audit: null, requirements, derivedRows: [] })
  assert.equal(result.ready, false)
  assert.equal(result.stage, 'integrity_missing')
  assert.equal(result.requiredThroughDate, '2026-08-18')
})

test('defers when an officially final game has no pitch log', () => {
  const current = audit({
    status: 'failed',
    summary: { failures: 1, warnings: 0 },
    checks: {
      ...audit().checks,
      official_schedule: { source_available: true, final_games: 15, final_games_without_pitch_log: 1, missing_game_pks: [123] },
    },
  })
  const result = evaluateMechanicsReadiness({ gameDate, currentDate: gameDate, audit: current, requirements, derivedRows: readyRows, categoryRows: readyCategories })
  assert.equal(result.ready, false)
  assert.equal(result.stage, 'pitch_log_incomplete')
})

test('does not call an omitted schedule check an MLB source outage', () => {
  const current = audit({
    checks: {
      pitch_log: { raw_to_typed_gaps: {}, classification_mismatches: 0, terminal_events_without_description: 0, fair_balls_without_event: 0 },
      game_coverage: { scheduled_games_without_pitch_log: 0 },
      category_freshness: { stale_categories: 0 },
    },
  })
  const result = evaluateMechanicsReadiness({ gameDate, currentDate: gameDate, audit: current, requirements, derivedRows: readyRows, categoryRows: readyCategories })
  assert.equal(result.ready, true)
  assert.equal(result.stage, 'ready')
})

test('still defers on an explicit MLB schedule source failure', () => {
  const current = audit({
    checks: {
      ...audit().checks,
      official_schedule: { source_available: false, final_games: 0, final_games_without_pitch_log: 0, missing_game_pks: [] },
    },
  })
  const result = evaluateMechanicsReadiness({ gameDate, currentDate: gameDate, audit: current, requirements, derivedRows: readyRows, categoryRows: readyCategories })
  assert.equal(result.ready, false)
  assert.equal(result.stage, 'official_schedule_pending')
})

test('keeps the newest canonical audit while carrying forward same-date schedule evidence', () => {
  const newest = audit({ id: 'newest', created_at: '2026-08-19T12:00:00.000Z', checks: { ...audit().checks, official_schedule: undefined } })
  const scheduled = audit({ id: 'scheduled', created_at: '2026-08-19T11:00:00.000Z' })
  const merged = newestMechanicsAudit([newest, scheduled])
  assert.equal(merged?.id, 'newest')
  assert.equal(merged?.checks.official_schedule?.source_available, true)
  assert.equal(merged?.checks.official_schedule?.final_games, 15)
})

test('defers when materialized Statcast fields fail integrity', () => {
  const current = audit({
    status: 'failed',
    summary: { failures: 2, warnings: 0 },
    checks: { ...audit().checks, pitch_log: { raw_to_typed_gaps: { launch_speed: 2 } } },
  })
  const result = evaluateMechanicsReadiness({ gameDate, currentDate: gameDate, audit: current, requirements, derivedRows: readyRows, categoryRows: readyCategories })
  assert.equal(result.ready, false)
  assert.equal(result.stage, 'integrity_failed')
})

test('defers until every required batter-hand profile exists for the exact game date', () => {
  const result = evaluateMechanicsReadiness({
    gameDate,
    currentDate: gameDate,
    audit: audit(),
    requirements,
    categoryRows: readyCategories,
    derivedRows: [
      readyRows[0],
    ],
  })
  assert.equal(result.ready, false)
  assert.equal(result.stage, 'dugout_statcast_pending')
  assert.deepEqual(result.missingProfiles, ['2:L'])
})

test('does not invalidate exact-date profiles when a later integrity audit runs', () => {
  const result = evaluateMechanicsReadiness({
    gameDate,
    currentDate: gameDate,
    audit: audit({ created_at: '2026-08-19T11:20:00.000Z' }),
    requirements,
    categoryRows: readyCategories.map(row => ({ ...row, last_synced_at: '2026-08-19T11:00:00.000Z' })),
    derivedRows: readyRows,
  })
  assert.equal(result.ready, true)
  assert.equal(result.stage, 'ready')
  assert.equal(result.freshnessBoundary, '2026-08-19T10:25:00.000Z')
})

test('opens the gate only after canonical and derived inputs are current', () => {
  const result = evaluateMechanicsReadiness({ gameDate, currentDate: gameDate, audit: audit(), requirements, derivedRows: readyRows, categoryRows: readyCategories })
  assert.equal(result.ready, true)
  assert.equal(result.stage, 'ready')
  assert.equal(result.freshnessBoundary, '2026-08-19T10:25:00.000Z')
})

test('defers when one mechanics-specific Statcast category did not refresh', () => {
  const result = evaluateMechanicsReadiness({
    gameDate,
    currentDate: gameDate,
    audit: audit(),
    requirements,
    derivedRows: readyRows,
    categoryRows: readyCategories.filter(row => row.category !== 'swing_timing_miss_distance'),
  })
  assert.equal(result.ready, false)
  assert.equal(result.stage, 'statcast_categories_pending')
})

test('historical boards keep their frozen pregame snapshot contract', () => {
  const result = evaluateMechanicsReadiness({ gameDate: '2026-08-17', currentDate: gameDate, audit: null, requirements, derivedRows: [] })
  assert.equal(result.ready, true)
  assert.equal(result.stage, 'historical')
  assert.equal(result.requiredThroughDate, '2026-08-16')
})
