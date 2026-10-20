import { NBA_FIRST_MARKETS } from './nbaFirstBasketMarkets'
export type SportMatrixFactor = {
  id?: string; category?: string; field?: string; propType?: string | null; marketValue?: string | null
  marketLine?: number | null; marketSide?: string; marketKind?: string; operator?: string
  value?: number | null; kind?: string; direction?: string; keep?: number; scope?: string
  vendor?: string | null; window?: string; location?: string
}
const words = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const fieldNames: Record<string, string> = { index: 'SlipSurge Score', mm: 'MM', fg3a: 'Three-point attempts', fga: 'Field-goal attempts', fgm: 'Field goals', fta: 'Free-throw attempts', ftm: 'Free throws' }
const marketValues: Record<string, string> = { current: 'Current odds', opening: 'Opening odds', move: 'American odds change', probability: 'Implied probability %', probability_move: 'Movement · pp', hit_rate: 'Hit rate %', line: 'Target' }
const books: Record<string, string> = { fanduel: 'FanDuel', draftkings: 'DraftKings', betmgm: 'BetMGM', caesars: 'Caesars', fanatics: 'Fanatics', betrivers: 'BetRivers', betparx: 'betPARX' }

export function sportMatrixFactorLabel(factor: SportMatrixFactor) {
  if (factor.kind === 'group') return `Group by ${factor.scope === 'game' ? 'game' : 'team'}`
  const isMarket = factor.category === 'market', isScore = factor.category === 'score', isPicks = factor.category === 'picks'
  let field = fieldNames[factor.field ?? ''] ?? words(factor.field ?? 'Condition')
  if (isMarket || isScore || isPicks) {
    const first = NBA_FIRST_MARKETS.find(m => m.key === factor.propType)
    const binary = !!first || factor.propType === 'double_double' || factor.propType === 'triple_double'
    const name = first?.label ?? words(factor.propType ?? 'Market')
    const target = binary ? factor.marketSide === 'under' ? 'No' : 'Yes'
      : factor.marketLine == null ? 'Balanced target'
      : factor.marketKind === 'over_under' ? `${factor.marketSide === 'under' ? 'U' : 'O'} ${factor.marketLine}` : `${factor.marketLine}+`
    field = isPicks ? `${name} · Public picks` : `${name} · ${target} · ${isMarket ? marketValues[factor.marketValue ?? 'current'] ?? words(factor.marketValue ?? 'current') : field}`
    if (!isPicks) field += ` · ${factor.vendor ? books[factor.vendor] ?? words(factor.vendor) : 'Best available'}`
  }
  if (['stats', 'tracking', 'usage'].includes(factor.category ?? '') || factor.marketValue === 'hit_rate') field += ` · ${factor.window === 'season' ? 'Season' : (factor.window ?? 'season').toUpperCase()}${factor.location && factor.location !== 'all' ? ` · ${words(factor.location)}` : ''}`
  if (factor.kind === 'rank') return `${field} · ${factor.direction === 'lowest' ? 'Lowest' : 'Highest'} ${factor.keep ?? 1} · ${factor.scope === 'game' ? 'In game' : 'Per team'}`
  const probabilityMove = factor.marketValue === 'probability_move'
  const operator = ({ gte: '≥', lte: '≤', eq: '=', up: probabilityMove ? 'Shortened' : 'Positive', down: probabilityMove ? 'Lengthened' : 'Negative', flat: 'Zero', is_available: 'Available' } as Record<string, string>)[factor.operator ?? ''] ?? words(factor.operator ?? '')
  const value = ['gte', 'lte', 'eq'].includes(factor.operator ?? '') && factor.value != null ? ` ${factor.value}` : ''
  return `${factor.kind === 'unless' ? `Unless ${factor.scope === 'game' ? 'game' : 'team'} · ` : ''}${field} ${operator}${value}`
}
