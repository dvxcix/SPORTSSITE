import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateNflMatrix, validateNflMatrixDefinition, type NflMatrix, type NflMatrixCandidate } from '../src/lib/nflMatrix.ts'
import { nflMatrixMatches } from '../src/lib/nflMatrixMatches.ts'
import type { SidelineLens, SidelinePlayer } from '../src/app/the-sideline/types.ts'
import type { SidelineOddsBoard } from '../src/lib/nflOddsTypes.ts'

const candidates: NflMatrixCandidate[] = [
  { id: 'a', team: 'BUF', values: factor => ({ index: 72, targets: 8, current: 130 }[factor.field] ?? null) },
  { id: 'b', team: 'BUF', values: factor => ({ index: 54, targets: 11, current: 210 }[factor.field] ?? null) },
  { id: 'c', team: 'MIA', values: factor => ({ index: 68, targets: 5, current: 175 }[factor.field] ?? null) },
]

function matrix(overrides: Partial<NflMatrix>): NflMatrix {
  return {
    id: 'matrix', name: 'Test', color: '#a7ff3f', priority: 0, enabled: true,
    matrix_type: 'classic', match_mode: 'all', match_any_count: 1, pipeline_scope: 'team',
    definition: { factors: [] }, element_code: 'NFL-TEST0001', ...overrides,
  }
}

test('classic NFL matrices support ALL and ANY without touching MLB definitions', () => {
  const factors = [
    { id: 'score', category: 'score' as const, field: 'index', operator: 'gte' as const, value: 65, window: 'season' as const, vendor: null, propType: null, marketValue: null },
    { id: 'targets', category: 'usage' as const, field: 'targets', operator: 'gte' as const, value: 8, window: 'season' as const, vendor: null, propType: null, marketValue: null },
  ]
  assert.deepEqual([...evaluateNflMatrix(matrix({ definition: { factors } }), candidates)], ['a'])
  assert.deepEqual([...evaluateNflMatrix(matrix({ match_mode: 'any', definition: { factors } }), candidates)], ['a', 'b', 'c'])
})

test('pipeline OR unions consecutive filters, then rank scopes per team', () => {
  const steps = [
    { id: 'score', kind: 'filter' as const, join: 'and' as const, category: 'score' as const, field: 'index', operator: 'gte' as const, value: 70, window: 'season' as const, vendor: null, propType: null, marketValue: null, direction: 'highest' as const, scope: 'team' as const, keep: 1 },
    { id: 'targets', kind: 'filter' as const, join: 'or' as const, category: 'usage' as const, field: 'targets', operator: 'gte' as const, value: 10, window: 'season' as const, vendor: null, propType: null, marketValue: null, direction: 'highest' as const, scope: 'team' as const, keep: 1 },
    { id: 'rank', kind: 'rank' as const, join: 'and' as const, category: 'score' as const, field: 'index', operator: 'is_available' as const, value: null, window: 'season' as const, vendor: null, propType: null, marketValue: null, direction: 'highest' as const, scope: 'team' as const, keep: 1 },
  ]
  const result = evaluateNflMatrix(matrix({ matrix_type: 'pipeline', definition: { steps } }), candidates)
  assert.deepEqual([...result], ['a'])
})

test('server validation rejects MLB fields and unknown NFL markets', () => {
  assert.equal(validateNflMatrixDefinition('classic', { factors: [{ id: 'x', category: 'score', field: 'barrelPct', operator: 'gte', value: 10, window: 'l3' }] }), null)
  assert.equal(validateNflMatrixDefinition('classic', { factors: [{ id: 'x', category: 'market', field: 'market', propType: 'home_run', vendor: 'fanduel', marketValue: 'current', operator: 'lte', value: 500, window: 'season' }] }), null)
})

test('NFL matrices validate Pikkit pick-count criteria separately from sportsbook prices', () => {
  const definition = validateNflMatrixDefinition('classic', { factors: [{
    id: 'picks', category: 'picks', field: 'public_picks', propType: 'anytime_td', vendor: null,
    marketValue: null, operator: 'gte', value: 100, window: 'season',
  }] })
  assert.equal(definition?.factors?.[0].category, 'picks')
  assert.equal(definition?.factors?.[0].propType, 'anytime_td')
})

test('board matches use the selected condition window and exclude inactive or unavailable inputs', () => {
  const recent = [
    { name: 'Eligible Runner', team: 'LA', targets: 4 },
    { name: 'Unavailable Runner', team: 'LAR', targets: 12, unavailableMetrics: ['targets'] },
    { name: 'Inactive Runner', team: 'LAR', targets: 11 },
  ] as SidelinePlayer[]
  const season = [{ name: 'Eligible Runner', team: 'LAR', targets: 0 }] as SidelinePlayer[]
  const windows: SidelineLens['windows'] = {
    season: { players: season, teams: [], plays: 0, weeks: [] },
    l1: { players: [], teams: [], plays: 0, weeks: [] },
    l3: { players: recent, teams: [], plays: 0, weeks: [] },
    l5: { players: [], teams: [], plays: 0, weeks: [] },
    l10: { players: [], teams: [], plays: 0, weeks: [] },
  }
  const rows = recent.map((player, id) => ({ name: player.name, team: 'LAR', id: String(id), market: null, eligible: id !== 2 }))
  const matrixDefinition = matrix({ definition: { factors: [{ id: 'targets', category: 'usage', field: 'targets',
    operator: 'gte', value: 4, window: 'l3', vendor: null, propType: null, marketValue: null }] } })
  const matches = nflMatrixMatches({ players: [] } as unknown as SidelineOddsBoard, windows, [matrixDefinition], rows, 'LAR', 'BUF')
  assert.deepEqual([...matches.keys()], ['0'])
})
