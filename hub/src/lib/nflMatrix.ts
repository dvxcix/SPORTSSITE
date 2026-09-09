export type NflMatrixCategory = 'score' | 'usage' | 'tracking' | 'team' | 'market' | 'baseline' | 'picks'
export type NflMatrixOperator = 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat' | 'is_available'
export type NflMatrixWindow = 'season' | 'l1' | 'l3' | 'l5' | 'l10'
export type NflMatrixJoin = 'and' | 'or'

export type NflMatrixFactor = {
  id: string
  category: NflMatrixCategory
  field: string
  operator: NflMatrixOperator
  value: number | null
  window: NflMatrixWindow
  vendor: string | null
  propType: string | null
  marketValue: 'current' | 'opening' | 'move' | 'line' | 'probability_move' | 'ratio' | 'ratio_move' | 'estimated_picks' | null
  marketLine?: number | null
  marketSide?: 'over' | 'under'
  marketKind?: 'milestone' | 'over_under'
}

export type NflMatrixPipelineStep = NflMatrixFactor & {
  kind: 'filter' | 'rank'
  join: NflMatrixJoin
  direction: 'highest' | 'lowest'
  scope: 'team' | 'game'
  keep: number
}

export type NflMatrixDefinition = {
  factors?: NflMatrixFactor[]
  steps?: NflMatrixPipelineStep[]
}

export type NflMatrix = {
  id: string
  name: string
  color: string
  priority: number
  enabled: boolean
  matrix_type: 'classic' | 'pipeline'
  match_mode: 'all' | 'any'
  match_any_count: number | null
  pipeline_scope: 'team' | 'game' | null
  definition: NflMatrixDefinition
  element_code: string
  created_at?: string
  updated_at?: string
}

export type NflMatrixField = {
  category: NflMatrixCategory
  field: string
  label: string
}

export const NFL_MATRIX_FIELDS: NflMatrixField[] = [
  ['score', 'index', 'SlipSurge Score'],
  ['score', 'volume', 'Volume score'],
  ['score', 'geometry', 'Route geometry score'],
  ['score', 'redZone', 'Red-zone score'],
  ['score', 'breakaway', 'Breakaway score'],
  ['score', 'evidence', 'Evidence score'],
  ['usage', 'targets', 'Targets'],
  ['usage', 'targetShare', 'Target share %'],
  ['usage', 'receptions', 'Receptions'],
  ['usage', 'receivingYards', 'Receiving yards'],
  ['usage', 'carries', 'Carries'],
  ['usage', 'carryShare', 'Carry share %'],
  ['usage', 'rushingYards', 'Rushing yards'],
  ['usage', 'passAttempts', 'Pass attempts'],
  ['usage', 'completions', 'Completions'],
  ['usage', 'passingYards', 'Passing yards'],
  ['usage', 'touchdowns', 'Touchdowns'],
  ['usage', 'redZoneLooks', 'Red-zone looks'],
  ['usage', 'goalLineLooks', 'Goal-line looks'],
  ['tracking', 'airYards', 'Average depth of target'],
  ['tracking', 'airYardsShare', 'Air-yards share %'],
  ['tracking', 'separation', 'Route separation'],
  ['tracking', 'yacAboveExpected', 'YAC over expected'],
  ['tracking', 'rushOverExpected', 'Rush yards over expected / attempt'],
  ['tracking', 'catchRate', 'Catch rate %'],
  ['tracking', 'completionRate', 'Completion rate %'],
  ['tracking', 'cpoe', 'Completion % over expected'],
  ['tracking', 'timeToThrow', 'Time to throw'],
  ['tracking', 'explosivePlays', 'Explosive plays'],
  ['team', 'teamPassRate', 'Team pass rate %'],
  ['team', 'teamNeutralPassRate', 'Neutral pass rate %'],
  ['team', 'teamShotgunRate', 'Shotgun rate %'],
  ['team', 'teamNoHuddleRate', 'No-huddle rate %'],
  ['team', 'teamSuccessRate', 'Offensive success rate %'],
  ['team', 'teamExplosiveRate', 'Offensive explosive rate %'],
  ['team', 'teamRedZoneTdRate', 'Red-zone TD rate %'],
  ['team', 'teamThirdDownRate', 'Third-down conversion %'],
  ['team', 'oppSuccessAllowed', 'Opponent success allowed %'],
  ['team', 'oppExplosiveAllowed', 'Opponent explosive allowed %'],
  ['baseline', 'ftdPct', 'FTD price vs player average %'],
  ['baseline', 'atdPct', 'ATD price vs player average %'],
].map(([category, field, label]) => ({ category: category as NflMatrixCategory, field, label }))

export const NFL_MATRIX_PROP_TYPES = [
  ['first_td', 'First touchdown'],
  ['last_td', 'Last touchdown'],
  ['anytime_td', 'Anytime touchdown'],
  ['two_plus_td', '2+ touchdowns'],
  ['three_plus_td', '3+ touchdowns'],
  ['anytime_td_1h', 'Anytime TD · first half'],
  ['passing_yards', 'Passing yards'],
  ['passing_tds', 'Passing touchdowns'],
  ['passing_attempts', 'Pass attempts'],
  ['passing_completions', 'Completions'],
  ['interceptions', 'Interceptions'],
  ['rushing_yards', 'Rushing yards'],
  ['rushing_attempts', 'Rush attempts'],
  ['receiving_yards', 'Receiving yards'],
  ['receptions', 'Receptions'],
  ['rushing_receiving_yards', 'Rush + receiving yards'],
  ['longest_reception', 'Longest reception'],
  ['longest_rush', 'Longest rush'],
  ['longest_completion', 'Longest completion'],
  ['fg_made', 'Field goals'],
  ['passing_yards_1h', 'Passing yards first half'],
  ['rushing_yards_1h', 'Rushing yards first half'],
  ['receiving_yards_1h', 'Receiving yards first half'],
  ['receptions_1h', 'Receptions first half'],
  ['field_goals_made', 'Field goals made'],
  ['kicking_points', 'Kicking points'],
  ['extra_points', 'Extra points'],
  ['defensive_td', 'Defensive touchdown'],
] as const

export const NFL_MATRIX_BOOKS = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'fanatics', 'betrivers'] as const

export type NflMatrixCandidate = {
  id: string
  team: string
  values: (factor: NflMatrixFactor) => number | null
}

function approximatelyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.0001
}

export function factorMatches(candidate: NflMatrixCandidate, factor: NflMatrixFactor) {
  const actual = candidate.values(factor)
  if (factor.operator === 'is_available') return actual != null
  if (actual == null) return false
  if (factor.operator === 'up') return actual > 0
  if (factor.operator === 'down') return actual < 0
  if (factor.operator === 'flat') return approximatelyEqual(actual, 0)
  if (factor.value == null) return false
  if (factor.operator === 'gte') return actual >= factor.value
  if (factor.operator === 'lte') return actual <= factor.value
  return approximatelyEqual(actual, factor.value)
}

export function evaluateNflMatrix(matrix: NflMatrix, candidates: NflMatrixCandidate[]) {
  if (!matrix.enabled) return new Set<string>()
  if (matrix.matrix_type === 'classic') {
    const factors = matrix.definition.factors ?? []
    if (!factors.length) return new Set<string>()
    return new Set(candidates.filter(candidate => {
      const matched = factors.filter(factor => factorMatches(candidate, factor)).length
      return matrix.match_mode === 'all' ? matched === factors.length : matched >= Math.max(1, matrix.match_any_count ?? 1)
    }).map(candidate => candidate.id))
  }

  let pool = [...candidates]
  let filterBase = [...candidates]
  let filterResult: Set<string> | null = null
  const steps = matrix.definition.steps ?? []
  for (const step of steps) {
    if (step.kind === 'filter') {
      const matched: Set<string> = new Set(filterBase.filter(candidate => factorMatches(candidate, step)).map(candidate => candidate.id))
      const previous: Set<string> | null = filterResult
      if (!previous) filterResult = matched
      else if (step.join === 'or') filterResult = new Set([...previous, ...matched])
      else filterResult = new Set<string>((Array.from(previous) as string[]).filter((id: string) => matched.has(id)))
      pool = filterBase.filter(candidate => filterResult!.has(candidate.id))
      continue
    }
    const scoped = new Map<string, NflMatrixCandidate[]>()
    pool.forEach(candidate => {
      const key = step.scope === 'team' ? candidate.team : 'game'
      scoped.set(key, [...(scoped.get(key) ?? []), candidate])
    })
    pool = Array.from(scoped.values()).flatMap(group => group
      .map(candidate => ({ candidate, value: candidate.values(step) }))
      .filter(item => item.value != null)
      .sort((a, b) => step.direction === 'highest' ? b.value! - a.value! : a.value! - b.value!)
      .slice(0, Math.max(1, step.keep || 1))
      .map(item => item.candidate))
    filterBase = [...pool]
    filterResult = null
  }
  return new Set(pool.map(candidate => candidate.id))
}

export function validateNflMatrixDefinition(matrixType: 'classic' | 'pipeline', raw: unknown): NflMatrixDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const rows = matrixType === 'classic' ? source.factors : source.steps
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 40) return null
  const validCategories = new Set<NflMatrixCategory>(['score', 'usage', 'tracking', 'team', 'market', 'baseline', 'picks'])
  const validOperators = new Set<NflMatrixOperator>(['gte', 'lte', 'eq', 'up', 'down', 'flat', 'is_available'])
  const validWindows = new Set<NflMatrixWindow>(['season', 'l1', 'l3', 'l5', 'l10'])
  const validFields = new Set(NFL_MATRIX_FIELDS.map(item => `${item.category}:${item.field}`))
  const validProps = new Set(NFL_MATRIX_PROP_TYPES.map(item => item[0]))
  const clean = rows.flatMap((row, index) => {
    if (!row || typeof row !== 'object') return []
    const value = row as Record<string, unknown>
    if (!validCategories.has(value.category as NflMatrixCategory) || typeof value.field !== 'string' || !validOperators.has(value.operator as NflMatrixOperator)) return []
    if (['market', 'picks'].includes(value.category as string) && (typeof value.propType !== 'string' || !validProps.has(value.propType as typeof NFL_MATRIX_PROP_TYPES[number][0]))) return []
    if (!['market', 'picks'].includes(value.category as string) && !validFields.has(`${value.category}:${value.field}`)) return []
    const operator = value.operator as NflMatrixOperator
    const numeric = typeof value.value === 'number' && Number.isFinite(value.value) ? value.value : null
    if (['gte', 'lte', 'eq'].includes(operator) && numeric == null) return []
    const base: NflMatrixFactor = {
      id: typeof value.id === 'string' ? value.id : `factor-${index}`,
      category: value.category as NflMatrixCategory,
      field: value.field,
      operator,
      value: numeric,
      window: validWindows.has(value.window as NflMatrixWindow) ? value.window as NflMatrixWindow : 'season',
      vendor: typeof value.vendor === 'string' && NFL_MATRIX_BOOKS.includes(value.vendor as typeof NFL_MATRIX_BOOKS[number]) ? value.vendor : null,
      propType: typeof value.propType === 'string' ? value.propType : null,
      marketValue: ['current', 'opening', 'move', 'line', 'probability_move', 'ratio', 'ratio_move', 'estimated_picks'].includes(value.marketValue as string) ? value.marketValue as NflMatrixFactor['marketValue'] : null,
      marketLine: typeof value.marketLine === 'number' && Number.isFinite(value.marketLine) ? value.marketLine : null,
      marketSide: value.marketSide === 'under' ? 'under' : 'over',
      marketKind: value.marketKind === 'over_under' ? 'over_under' : value.marketKind === 'milestone' ? 'milestone' : undefined,
    }
    if (matrixType === 'classic') return [base]
    return [{
      ...base,
      kind: value.kind === 'rank' ? 'rank' : 'filter',
      join: value.join === 'or' ? 'or' : 'and',
      direction: value.direction === 'lowest' ? 'lowest' : 'highest',
      scope: value.scope === 'game' ? 'game' : 'team',
      keep: typeof value.keep === 'number' ? Math.min(20, Math.max(1, Math.round(value.keep))) : 1,
    } satisfies NflMatrixPipelineStep]
  })
  if (clean.length !== rows.length) return null
  return matrixType === 'classic' ? { factors: clean as NflMatrixFactor[] } : { steps: clean as NflMatrixPipelineStep[] }
}
