import type { PaintPlayer, PaintProp } from './nbaPaint'
export type NbaMarketSelection = { type: 'milestone' | 'over_under'; line?: number }
export function nbaSelectedProps(props: PaintProp[], market: string, selection?: NbaMarketSelection) {
  return !selection ? props : props.filter(p => p.prop_type !== market || p.market.type === selection.type && (selection.line == null || Number(p.line_value) === selection.line))
}
export function nbaSelectedPlayers(players: PaintPlayer[], market: string, selection?: NbaMarketSelection) {
  return players.map(player => ({ ...player, props: nbaSelectedProps(player.props, market, selection) }))
}
export function nbaReadSelection(params: URLSearchParams): NbaMarketSelection | undefined {
  const type = params.get('contract'), line = params.get('target')
  if (type !== 'milestone' && type !== 'over_under') return undefined
  return { type, ...(line != null && line !== '' && Number.isFinite(Number(line)) && Number(line) >= 0 ? { line: Number(line) } : {}) }
}
