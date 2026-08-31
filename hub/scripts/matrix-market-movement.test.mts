import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeDisplayedRatioMovement,
  evaluateDugoutSpecsFactor,
  evaluateOddsFactor,
  runPipeline,
  type FieldBundle,
  type MatrixFactor,
  type MatrixPipelineStep,
  type OddsProps,
} from '../packages/core/src/matrixEngine.ts'

function propsWithMovement(market: 'tb3' | 'tb4' | null): OddsProps {
  return {
    sa: { fanduel: 500 },
    tb3: { fanduel: market === 'tb3' ? 320 : 500 },
    tb4: { fanduel: market === 'tb4' ? 320 : 500 },
    open: {
      saFd: 500,
      tb3Fd: market === 'tb3' ? 326 : 500,
      tb4Fd: market === 'tb4' ? 326 : 500,
    },
  } as unknown as OddsProps
}

function bundle(props: OddsProps): FieldBundle {
  return {
    props,
    fhrAvg: null,
    saAvg: null,
    pitchlogWindows: null,
    statcastWindows: null,
    pikkitEntry: null,
  }
}

function movementStep(field_key: string, join_mode: 'and' | 'or' | null): MatrixPipelineStep {
  return {
    kind: 'filter', join_mode, category: 'dugout_specs', field_key,
    recency: null, book: null, books: null, books_min_count: null,
    operator: 'lte', value: -0.01, direction: null, tolerance: null, zero_eligible: null,
    condition_scope: null, condition_steps: null, then_steps: null, unless_mode: null, uses_anchor: null,
    mm_base_window: null, mm_compare_windows: null, mm_direction: null, mm_match_mode: null, mm_amount_mode: null,
  }
}

test('ratio movement uses the two displayed decimals before subtracting', () => {
  const props = propsWithMovement('tb4')
  assert.equal(computeDisplayedRatioMovement('sa_div_tb4', props), -0.01)
  assert.equal(computeDisplayedRatioMovement('sa_div_tb3', props), 0)
})

test('ratio movement does not invent a value without an opening ratio', () => {
  const props = propsWithMovement('tb4')
  delete props.open?.tb4Fd
  assert.equal(computeDisplayedRatioMovement('sa_div_tb4', props), null)
})

test('FHR/HR down filter rejects a ratio that moved up', () => {
  const factor = {
    id: 'fhr-hr-down', category: 'dugout_specs', field_key: 'fhr_div_sa_move',
    operator: 'lte', value: -0.01, recency: null, recency_start: null, recency_end: null,
    books: null, books_min_count: null, tie_scope: null, tie_direction: null, tiebreakers: null,
    mm_base_window: null, mm_compare_windows: null, mm_direction: null,
    mm_match_mode: null, mm_amount_mode: null,
  } as MatrixFactor
  const movedDown = {
    fhr: { fanduel: 1100 }, sa: { fanduel: 550 },
    open: { fhr: 1000, saFd: 550 },
  } as unknown as OddsProps
  const movedUp = {
    fhr: { fanduel: 900 }, sa: { fanduel: 550 },
    open: { fhr: 1000, saFd: 550 },
  } as unknown as OddsProps

  assert.ok(computeDisplayedRatioMovement('fhr_div_sa', movedDown)! < 0)
  assert.ok(computeDisplayedRatioMovement('fhr_div_sa', movedUp)! > 0)
  assert.equal(evaluateDugoutSpecsFactor(factor, movedDown, null, null), true)
  assert.equal(evaluateDugoutSpecsFactor(factor, movedUp, null, null), false)
})

test('adjacent OR filters evaluate each alternative against the entering pool', () => {
  const bundles = new Map<string, FieldBundle>([
    ['tb4-player', bundle(propsWithMovement('tb4'))],
    ['tb3-player', bundle(propsWithMovement('tb3'))],
    ['flat-player', bundle(propsWithMovement(null))],
  ])
  const universe = new Set(bundles.keys())
  const steps = [
    movementStep('sa_div_tb4_move', null),
    movementStep('sa_div_tb3_move', 'or'),
  ]
  assert.deepEqual([...runPipeline(universe, steps, bundles, {})].sort(), ['tb3-player', 'tb4-player'])
})

test('missing connector remains backward-compatible AND', () => {
  const bothProps = propsWithMovement('tb4')
  bothProps.tb3 = { fanduel: 320 }
  if (bothProps.open) bothProps.open.tb3Fd = 326
  const bundles = new Map<string, FieldBundle>([
    ['both-player', bundle(bothProps)],
    ['tb4-player', bundle(propsWithMovement('tb4'))],
    ['tb3-player', bundle(propsWithMovement('tb3'))],
  ])
  const steps = [
    movementStep('sa_div_tb4_move', null),
    movementStep('sa_div_tb3_move', null),
  ]
  assert.deepEqual([...runPipeline(new Set(bundles.keys()), steps, bundles, {})], ['both-player'])
})

test('raw Hits + Runs + RBIs odds are available to Matrices', () => {
  const factor = {
    id: 'hrr-test', category: 'odds', field_key: 'hrr', operator: 'down', value: null,
    recency: null, recency_start: null, recency_end: null, books: null, books_min_count: null,
    tie_scope: null, tie_direction: null, tiebreakers: null,
    mm_base_window: null, mm_compare_windows: null, mm_direction: null, mm_match_mode: null, mm_amount_mode: null,
  } as MatrixFactor
  const props = { hrr: { fanduel: 450 }, open: { hrrFd: 500 } } as unknown as OddsProps
  assert.equal(evaluateOddsFactor(factor, props), true)
})
