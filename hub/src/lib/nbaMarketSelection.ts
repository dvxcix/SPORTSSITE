import { nbaBinary, type PaintPlayer, type PaintProp } from './nbaPaint'
export type NbaMarketSelection = { type: 'milestone' | 'over_under'; line?: number }
export function nbaSelectedProps(props: PaintProp[], market: string, selection?: NbaMarketSelection) {
  // Binary achievements are Yes/No contracts, even when the provider encodes
  // them as O/U 0.5. Retain that exact offer under the milestone preference.
  return !selection ? props : props.filter(p => p.prop_type !== market ||
    (p.market.type === selection.type || selection.type === 'milestone' && nbaBinary(market) && p.market.type === 'over_under' && Number(p.line_value) === .5)
    && (selection.line == null || Number(p.line_value) === selection.line))
}
export function nbaSelectedPlayers(players: PaintPlayer[], market: string, selection?: NbaMarketSelection) {
  return players.map(player => ({ ...player, props: nbaSelectedProps(player.props, market, selection) }))
}
export function nbaReadSelection(params: URLSearchParams): NbaMarketSelection | undefined {
  const type = params.get('contract'), line = params.get('target')
  if (type !== 'milestone' && type !== 'over_under') return undefined
  return { type, ...(line != null && line !== '' && Number.isFinite(Number(line)) && Number(line) >= 0 ? { line: Number(line) } : {}) }
}
