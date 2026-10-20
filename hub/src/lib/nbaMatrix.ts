import { PAINT_MARKETS, nbaAverage, nbaHitRate, nbaMarketLogs, nbaMinutes, nbaPrice, nbaReference, nbaSample, nbaValue, type PaintBoard, type PaintPlayer, type PaintProp } from './nbaPaint'
import { NBA_FIRST_MARKETS, nbaFirstMarket } from './nbaFirstBasketMarkets'
import { impliedProbability, nbaMarketRanks } from './nbaMarketMetrics'
import { nbaGamePace, nbaPosition, nbaSlipSurgeScore, type NbaDvp } from './nbaIntelligence'
import type { NbaMarketContext } from './nbaMarketSignal'
import { nbaTrackingField, nbaTrackingSample, type NbaTrackingRow } from './nbaTracking'

export type NbaMatrixCategory = 'score' | 'stats' | 'tracking' | 'team' | 'market' | 'picks'
export type NbaMatrixFactor = {
  id: string; category: NbaMatrixCategory; field: string
  operator: 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat' | 'is_available'
  value: number | null; window: 'season' | 'l1' | 'l3' | 'l5' | 'l10' | 'l20'
  vendor: string | null; propType: string | null
  marketValue: 'current' | 'opening' | 'move' | 'line' | 'probability' | 'probability_move' | 'hit_rate' | null
  marketLine?: number | null; marketSide?: 'over' | 'under'; marketKind?: 'milestone' | 'over_under'
  location?: 'all' | 'home' | 'away'
}
export type NbaMatrixPipelineStep = NbaMatrixFactor & {
  kind: 'filter' | 'rank' | 'group' | 'unless'; join: 'and' | 'or'
  direction: 'highest' | 'lowest'; scope: 'team' | 'game'; keep: number
}
export type NbaMatrixDefinition = { factors?: NbaMatrixFactor[]; steps?: NbaMatrixPipelineStep[] }
export type NbaMatrix = {
  id: string; name: string; color: string; priority: number; enabled: boolean
  matrix_type: 'classic' | 'pipeline'; match_mode: 'all' | 'any'; match_any_count: number | null
  pipeline_scope: 'team' | 'game' | null; definition: NbaMatrixDefinition; element_code: string
}
export const NBA_MATRIX_FIELDS: { category: NbaMatrixCategory; field: string; label: string }[] = [
  ['score', 'index', 'SlipSurge Score'], ['score', 'mm', 'MM'], ['score', 'opportunity', 'Opportunity score'],
  ['score', 'role', 'Minutes score'], ['score', 'form', 'Form score'], ['score', 'stability', 'Role stability'],
  ['score', 'matchup', 'Position allowance score'], ['score', 'pace', 'Pace score'],
  ...PAINT_MARKETS.filter(m => !m.key.endsWith('first3min')).map(m => ['stats', m.key, m.label]),
  ['stats', 'minutes', 'Minutes'], ['stats', 'fga', 'Field-goal attempts'], ['stats', 'fgm', 'Field goals'],
  ['stats', 'fg3a', 'Three-point attempts'], ['stats', 'fta', 'Free-throw attempts'], ['stats', 'ftm', 'Free throws'],
  ['tracking', 'usage_percentage', 'Usage %'], ['tracking', 'true_shooting_percentage', 'True shooting %'],
  ['tracking', 'effective_field_goal_percentage', 'Effective FG %'], ['tracking', 'assist_percentage', 'Assist %'],
  ['tracking', 'rebound_percentage', 'Rebound %'], ['tracking', 'offensive_rating', 'Offensive rating'],
  ['tracking', 'defensive_rating', 'Defensive rating'], ['tracking', 'net_rating', 'Net rating'],
  ['tracking', 'pace', 'Pace'], ['tracking', 'pie', 'Player impact'],
  ['team', 'pace', 'Team pace'], ['team', 'off_rating', 'Team offensive rating'], ['team', 'def_rating', 'Team defensive rating'],
  ['team', 'net_rating', 'Team net rating'], ['team', 'opp_pace', 'Opponent pace'],
  ['team', 'opp_off_rating', 'Opponent offensive rating'], ['team', 'opp_def_rating', 'Opponent defensive rating'],
].map(([category, field, label]) => ({ category: category as NbaMatrixCategory, field, label }))
export const NBA_MATRIX_PROP_TYPES = [
  ...PAINT_MARKETS.map(m => [m.key, m.label] as const),
  ...NBA_FIRST_MARKETS.map(m => [m.key, m.label] as const),
] as const
export const NBA_MATRIX_BOOKS = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'fanatics', 'betrivers', 'betparx'] as const
export type NbaMatrixCandidate = { id: string; team: string; values: (factor: NbaMatrixFactor) => number | null }
export function nbaMatrixFactorMatches(candidate: NbaMatrixCandidate, factor: NbaMatrixFactor) {
  const value = candidate.values(factor)
  if (value == null || !Number.isFinite(value)) return false
  if (factor.operator === 'is_available') return true
  if (factor.operator === 'up') return value > 0
  if (factor.operator === 'down') return value < 0
  if (factor.operator === 'flat') return Math.abs(value) < .0001
  if (factor.value == null) return false
  return factor.operator === 'gte' ? value >= factor.value : factor.operator === 'lte' ? value <= factor.value : Math.abs(value - factor.value) < .0001
}
export function evaluateNbaMatrix(matrix: NbaMatrix, candidates: NbaMatrixCandidate[]) {
  if (!matrix.enabled) return new Set<string>()
  if (matrix.matrix_type === 'classic') {
    const factors = matrix.definition.factors ?? []
    return new Set(candidates.filter(c => {
      const hits = factors.filter(f => nbaMatrixFactorMatches(c, f)).length
      return factors.length > 0 && (matrix.match_mode === 'all' ? hits === factors.length : hits >= Math.max(1, matrix.match_any_count ?? 1))
    }).map(c => c.id))
  }
  const steps = matrix.definition.steps ?? []
  if (!steps.length) return new Set<string>()
  let pool = [...candidates], base = [...candidates], filtered: Set<string> | null = null
  let groupScope: 'team' | 'game' | null = null
  for (const step of steps) {
    if (step.kind === 'group') { groupScope = step.scope; base = [...pool]; filtered = null; continue }
    if (step.kind === 'filter') {
      const hit = new Set(base.filter(c => nbaMatrixFactorMatches(c, step)).map(c => c.id))
      const previous: Set<string> | null = filtered
      filtered = previous == null ? hit : step.join === 'or' ? new Set([...previous, ...hit]) : new Set((Array.from(previous) as string[]).filter(id => hit.has(id)))
      pool = base.filter(c => filtered!.has(c.id))
      continue
    }
    const scope = groupScope ?? step.scope
    const groups = new Map<string, NbaMatrixCandidate[]>()
    for (const c of pool) { const key = scope === 'team' ? c.team : 'game'; groups.set(key, [...groups.get(key) ?? [], c]) }
    pool = [...groups.values()].flatMap(group => step.kind === 'unless'
      ? group.some(c => nbaMatrixFactorMatches(c, step)) ? [] : group
      : group.map(c => ({ c, v: c.values(step) })).filter((r): r is { c: NbaMatrixCandidate; v: number } => r.v != null && Number.isFinite(r.v))
        .sort((a, b) => (step.direction === 'highest' ? b.v - a.v : a.v - b.v) || a.c.id.localeCompare(b.c.id))
        .slice(0, step.keep).map(r => r.c))
    base = [...pool]; filtered = null
  }
  return new Set(pool.map(c => c.id))
}
export function validateNbaMatrixDefinition(type: 'classic' | 'pipeline', raw: unknown): NbaMatrixDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const rows = (raw as NbaMatrixDefinition)[type === 'classic' ? 'factors' : 'steps']
  if (!Array.isArray(rows) || !rows.length || rows.length > 40) return null
  const fields = new Set(NBA_MATRIX_FIELDS.map(f => `${f.category}:${f.field}`))
  const clean: (NbaMatrixFactor | NbaMatrixPipelineStep)[] = []
  for (const rawRow of rows) {
    if (!rawRow || typeof rawRow !== 'object') return null
    const f = rawRow as NbaMatrixPipelineStep
    const group = type === 'pipeline' && f.kind === 'group'
    if (!['score', 'stats', 'tracking', 'team', 'market', 'picks'].includes(f.category)) return null
    if (!['gte', 'lte', 'eq', 'up', 'down', 'flat', 'is_available'].includes(f.operator)) return null
    if (!group && ['gte', 'lte', 'eq'].includes(f.operator) && (typeof f.value !== 'number' || !Number.isFinite(f.value))) return null
    if (!group && !['market', 'picks', 'tracking'].includes(f.category) && !fields.has(`${f.category}:${f.field}`)) return null
    if (f.category === 'tracking' && (typeof f.field !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(f.field))) return null
    if (!group && ['market', 'picks', 'score'].includes(f.category) && !NBA_MATRIX_PROP_TYPES.some(m => m[0] === f.propType)) return null
    if (f.category === 'score' && !PAINT_MARKETS.some(m => m.key === f.propType && !m.key.endsWith('first3min'))) return null
    if (f.vendor != null && !NBA_MATRIX_BOOKS.includes(f.vendor as typeof NBA_MATRIX_BOOKS[number])) return null
    if (f.marketLine != null && (typeof f.marketLine !== 'number' || !Number.isFinite(f.marketLine) || f.marketLine < 0)) return null
    if (f.marketKind === 'milestone' && f.marketSide === 'under') return null
    if (nbaFirstMarket(f.propType ?? '') && (f.marketKind !== 'over_under' || f.marketLine !== .5)) return null
    if (f.category === 'market' && !['current', 'opening', 'move', 'line', 'probability', 'probability_move', 'hit_rate'].includes(f.marketValue ?? '')) return null
    const row: NbaMatrixFactor = {
      id: typeof f.id === 'string' ? f.id.slice(0, 80) : `factor-${clean.length}`, category: f.category, field: f.field,
      operator: f.operator, value: typeof f.value === 'number' && Number.isFinite(f.value) ? f.value : null,
      window: ['season','l1','l3','l5','l10','l20'].includes(f.window) ? f.window : 'season',
      vendor: f.vendor ?? null, propType: f.propType ?? null, marketValue: f.marketValue ?? null,
      marketLine: f.marketLine ?? null, marketSide: f.marketSide === 'under' ? 'under' : 'over',
      marketKind: f.marketKind === 'over_under' ? 'over_under' : 'milestone',
      location: f.location === 'home' || f.location === 'away' ? f.location : 'all',
    }
    if (type === 'pipeline') {
      if (!['filter','rank','group','unless'].includes(f.kind)) return null
      clean.push({ ...row, kind: f.kind, join: f.join === 'or' ? 'or' : 'and', direction: f.direction === 'lowest' ? 'lowest' : 'highest', scope: f.scope === 'game' ? 'game' : 'team', keep: typeof f.keep === 'number' && Number.isFinite(f.keep) ? Math.min(50, Math.max(1, Math.round(f.keep))) : 1 })
    } else clean.push(row)
  }
  return type === 'classic' ? { factors: clean } : { steps: clean as NbaMatrixPipelineStep[] }
}
export type NbaMatrixContext = { defense?: NbaDvp[]; market?: NbaMarketContext | null; tracking?: NbaTrackingRow[]; publicPicks?: { playerId: number; market: string; picks: number }[] }
export function nbaMatrixOffer(player: PaintPlayer, factor: NbaMatrixFactor): PaintProp | null {
  const props = player.props.filter(p => p.prop_type === factor.propType && (!factor.vendor || p.vendor === factor.vendor)
    && (!factor.marketKind || p.market.type === factor.marketKind) && (factor.marketLine == null || Number(p.line_value) === factor.marketLine))
  const reference = nbaReference(props, factor.propType ?? 'points', factor.vendor ?? 'all', factor.marketSide)
  if (!reference) return null
  return props.filter(p => p.market.type === reference.market.type && Number(p.line_value) === Number(reference.line_value) && nbaPrice(p, factor.marketSide) != null)
    .sort((a,b) => nbaPrice(b, factor.marketSide)! - nbaPrice(a, factor.marketSide)! || b.updated_at.localeCompare(a.updated_at))[0] ?? null
}
export function nbaMatrixCandidates(board: PaintBoard, context: NbaMatrixContext = {}): NbaMatrixCandidate[] {
  const cache = new Map<string, Map<number, number | null>>()
  const values = (factor: NbaMatrixFactor): Map<number, number | null> => {
    const key = JSON.stringify({ ...factor, id: '' })
    if (cache.has(key)) return cache.get(key)!
    const selected = board.players.map(p => ({ ...p, props: p.props.filter(o => o.prop_type !== factor.propType || ((!factor.marketKind || o.market.type === factor.marketKind) && (factor.marketLine == null || Number(o.line_value) === factor.marketLine))) }))
    const market = PAINT_MARKETS.find(m => m.key === factor.propType)?.key
    const ranks = factor.field === 'mm' && market ? nbaMarketRanks(selected, market, factor.vendor ?? 'all', factor.location, { gameId: board.game.id, beforeDate: board.game.date }) : null
    const result = new Map(board.players.map(player => {
      const offer = nbaMatrixOffer(player, factor), side = factor.marketSide ?? 'over', current = offer ? nbaPrice(offer, side) : null
      const opening = offer?.opening?.[side], openingValid = opening && offer && Date.parse(opening.at) < Date.parse(offer.updated_at)
      const count = factor.window === 'season' ? Number.MAX_SAFE_INTEGER : Number(factor.window.slice(1))
      const logs = nbaSample(nbaMarketLogs(player, factor.propType ?? factor.field).filter(l => l.game.date.slice(0, 10) < board.game.date), count, factor.location)
      let value: number | null = null
      if (factor.category === 'market') {
        const probability = impliedProbability(current), openProbability = impliedProbability(opening?.odds)
        value = factor.marketValue === 'current' ? current ?? null : factor.marketValue === 'opening' ? opening?.odds ?? null
          : factor.marketValue === 'move' ? openingValid && current != null ? current - opening.odds : null
          : factor.marketValue === 'line' ? offer ? Number(offer.line_value) : null
          : factor.marketValue === 'probability' ? probability == null ? null : probability * 100
          : factor.marketValue === 'probability_move' ? openingValid && probability != null && openProbability != null ? (probability - openProbability) * 100 : null
          : offer && market ? nbaHitRate(logs, market, Number(offer.line_value), side, offer.market.type === 'milestone').rate : null
      } else if (factor.category === 'stats') {
        const statMarket = PAINT_MARKETS.find(m => m.key === factor.field)?.key
        const statLogs = nbaSample(nbaMarketLogs(player, factor.field).filter(l => l.game.date.slice(0, 10) < board.game.date), count, factor.location)
        if (factor.window === 'season' && factor.location === 'all' && !board.historical) value = statMarket ? nbaValue(player.average, statMarket) : player.average[factor.field === 'minutes' ? 'min' : factor.field] ?? null
        else if (statMarket) value = nbaAverage(statLogs, statMarket)
        else { const nums = statLogs.map(l => factor.field === 'minutes' ? nbaMinutes(l.min) : (l as unknown as Record<string, unknown>)[factor.field]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)); value = nums.length ? nums.reduce((a,b) => a+b,0)/nums.length : null }
      } else if (factor.category === 'score' && market && offer) {
        if (factor.field === 'mm') value = board.statsComplete && (!market.endsWith('_1q') || board.periodStatsComplete !== false) ? ranks?.get(player.id)?.mm ?? null : null
        else {
          const opponent = player.team.id === board.game.home_team.id ? board.game.visitor_team.id : board.game.home_team.id
          const matchup = context.defense?.find(p => p.teamId === opponent && p.position === nbaPosition(player.position) && p.market === market)
          const score = nbaSlipSurgeScore(player, market, board.game.date, matchup, nbaGamePace(board), offer ? { offer, side, context: context.market ?? null } : undefined)
          value = factor.field === 'index' ? score.score : score.parts.find(p => p.key === factor.field)?.value ?? null
        }
      } else if (factor.category === 'tracking') {
        value = nbaTrackingSample(player, context.tracking ?? [], factor.field, Math.min(count,20), factor.location).average
        if (value != null && nbaTrackingField(factor.field).percentage) value *= 100
      } else if (factor.category === 'team') {
        const opp = factor.field.startsWith('opp_'), id = opp ? player.team.id === board.game.home_team.id ? board.game.visitor_team.id : board.game.home_team.id : player.team.id
        value = board.teamStats?.find(t => t.team.id === id)?.stats[opp ? factor.field.slice(4) : factor.field] ?? null
      } else if (factor.category === 'picks') value = context.publicPicks?.find(p => p.playerId === player.id && p.market === factor.propType)?.picks ?? null
      return [player.id, value != null && Number.isFinite(value) ? value : null] as const
    }))
    cache.set(key, result); return result
  }
  return board.players.map(player => ({ id: String(player.id), team: String(player.team.id), values: factor => values(factor).get(player.id) ?? null }))
}
