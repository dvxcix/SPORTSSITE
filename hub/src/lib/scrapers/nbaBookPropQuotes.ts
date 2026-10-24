import { createHash } from 'node:crypto'
import { nbaName, type PaintProp } from '../nbaPaint'
import { nbaValidOdds } from '../nbaOddsHistory'
import { nbaPlayerIdentities } from '../nbaPlayerIdentity'
import { nbaBookObservation, type NbaFirstBookBoard, type NbaFirstBookInput } from './nbaFirstBookQuotes'

// Exact milestone accordion titles retained from the visible NBA book menu.
// O/U accordions are deliberately separate contracts and never use this map.
export const MGM_MILESTONE_PANELS: Record<string, string> = {
  'Player points': 'points', 'Player rebounds': 'rebounds', 'Player assists': 'assists', 'Player three-pointers': 'threes',
  'Player points + rebounds + assists': 'points_rebounds_assists', 'Player points + rebounds': 'points_rebounds',
  'Player points + assists': 'points_assists', 'Player rebounds + assists': 'rebounds_assists', 'Player blocks': 'blocks',
  'Player double-double': 'double_double', 'Player triple-double': 'triple_double',
}
export type NbaBookPropCapture = {
  gameId: number; contractKey: string; market: string; complete: boolean; observedAt: string | null
  status: 'captured' | 'partial' | 'unavailable' | 'unlisted' | 'closed' | 'deadline' | 'error' | 'identity-mismatch'
  props: PaintProp[]; unmatched: number
}
export type NbaBookPropCoverage = { gameId: number; market: string; complete: boolean; observedAt: string; contracts: string[]; status?: 'unavailable'|'deadline' }
export function nbaUnresolvedBookCoverage(gameId: number, observedAt = new Date().toISOString()): NbaBookPropCoverage[] {
  return [...new Set(Object.values(MGM_MILESTONE_PANELS))].map(market => ({ gameId, market, complete: false, observedAt, contracts: [] }))
}
export type NbaBookPropBoard = Pick<NbaFirstBookBoard, 'away' | 'home' | 'dateLabel' | 'timeLabel' | 'timeZone' | 'observedAt'> & {
  title: string; target: string; selectedTarget: string; expanded: boolean; transitioned: boolean
  rows: { name: string; side: string; odds: string; unavailable: boolean }[]
}
export function nbaBookPropContract(title: string, target: string) {
  const market = MGM_MILESTONE_PANELS[title]
  if (['double_double', 'triple_double'].includes(market) && target === '0.5') return { market, type: 'over_under' as const, line: .5, key: `${market}:over_under:0.5` }
  // The observed Player blocks accordion is an O/U table with explicit
  // O 0.5 / U 0.5 selections, despite sharing the milestone menu naming.
  const ordinary = market === 'blocks' ? target.match(/^O\/U (\d+\.5)$/) : null
  if (ordinary && Number(ordinary[1]) < 200) return { market, type: 'over_under' as const, line: Number(ordinary[1]), key: `${market}:over_under:${Number(ordinary[1])}` }
  const value = target.match(/^([1-9]\d{0,2})\+$/), line = value ? Number(value[1]) : NaN
  if (['double_double', 'triple_double'].includes(market)) return null
  return market && Number.isSafeInteger(line) && line <= 200 ? { market, type: 'milestone' as const, line, key: `${market}:milestone:${line}` } : null
}
export function nbaBookPropMissing(gameId: number, title: string, target: string, status: NbaBookPropCapture['status']): NbaBookPropCapture | null {
  const contract = nbaBookPropContract(title, target)
  return contract ? { gameId, market: contract.market, contractKey: contract.key, status, complete: false, observedAt: null, props: [], unmatched: 0 } : null
}
export function nbaNormalizeBookProp(input: NbaFirstBookInput, board: NbaBookPropBoard, now = Date.now()): NbaBookPropCapture | null {
  const result = nbaBookPropMissing(input.game.id, board.title, board.target, 'unavailable'), contract = nbaBookPropContract(board.title, board.target)
  if (!result || !contract) return null
  const identity = nbaBookObservation(input, board, now)
  if (identity.status === 'identity-mismatch' || identity.status === 'closed') return { ...result, status: identity.status }
  if (board.selectedTarget !== board.target || !board.transitioned) return { ...result, status: 'partial' }
  result.observedAt = board.observedAt
  const identities = nbaPlayerIdentities(input.roster.filter(player => [input.game.home_team.id, input.game.visitor_team.id].includes(player.team.id)))
  const props = new Map<string, PaintProp>(), conflicts = new Set<string>()
  for (const row of board.rows) {
    if (row.unavailable) continue // Only an explicit disabled selection is absence evidence.
    const matching = identities.filter(identity => identity.names.includes(nbaName(row.name)))
    const odds = /^[+\-−]\d{3,7}$/.test(row.odds.trim()) ? Number(row.odds.replace('−', '-')) : NaN
    const sides = contract.type === 'milestone' ? ['Yes'] : contract.market === 'blocks' ? ['Over', 'Under'] : ['Yes', 'No']
    if (matching.length !== 1 || !sides.includes(row.side) || !nbaValidOdds(odds)) { result.unmatched++; continue }
    const player = matching[0].player, field = contract.type === 'milestone' ? 'odds' : ['Yes', 'Over'].includes(row.side) ? 'over_odds' : 'under_odds', sideKey = `${player.id}:${field}`, prior = props.get(sideKey)
    if (prior) { result.unmatched++; if (prior.market[field] !== odds) conflicts.add(sideKey); continue }
    const key = `${input.game.id}:${player.id}:betmgm:${contract.key}`
    props.set(sideKey, { id: -5_000_000_000_000 - parseInt(createHash('sha256').update(key).digest('hex').slice(0, 12), 16), game_id: input.game.id, player_id: player.id,
      vendor: 'betmgm', prop_type: contract.market, line_value: String(contract.line), market: { type: contract.type, [field]: odds }, updated_at: board.observedAt })
  }
  const combined = new Map<number, PaintProp>()
  for (const [key, prop] of props) if (!conflicts.has(key)) {
    const prior = combined.get(prop.player_id)
    combined.set(prop.player_id, prior ? { ...prop, market: { ...prior.market, ...prop.market } } : prop)
  }
  result.props = [...combined.values()]
  result.complete = board.expanded && board.rows.length > 0 && result.unmatched === 0
  result.status = result.complete ? 'captured' : result.props.length || result.unmatched ? 'partial' : 'unavailable'
  return result
}
