// Shared archives contain full canonical inputs; authorization is reapplied at
// the response boundary and never encoded into a shared snapshot.
export function visibleMlbProps<T extends Record<string, any>>(props: T | null, prices: boolean, research: boolean): T | Omit<T, 'open'> | null {
  if (!prices || !props) return null
  if (research) return props
  const { open: _opening, ...visible } = props
  return visible
}
export function visibleMlbPublicRows<T extends Record<string, any>>(rows: T[], research: boolean) {
  return research ? rows : rows.map(row => ({ ...row, movement: null }))
}
export function visibleMlbMechanics<T>(value: T | null, research: boolean): T | null {
  return research ? value : null
}

export function hasCompleteMlbPaperInputs(input: {
  homeLineup: Array<{ mlb_id: number }>; awayLineup: Array<{ mlb_id: number }>;
  homePitcher: { id: number; hand?: string } | null; awayPitcher: { id: number; hand?: string } | null;
  pitcherSplits: Array<Record<string, any>>;
  statcast: Record<number, any>; batterMatchup: Record<number, any>; pitcherMatchup: Record<number, any>;
}) {
  if (!input.homePitcher || !input.awayPitcher || !input.homeLineup.length || !input.awayLineup.length) return false
  const mixFields = ['pct_fastball','pct_sinker','pct_cutter','pct_slider','pct_curveball','pct_changeup','pct_splitter']
  if (![input.homePitcher.id, input.awayPitcher.id].every(id => input.pitcherSplits.some(row => Number(row.mlb_id) === id && mixFields.some(field => Number(row[field]) > 0)) && input.pitcherMatchup[id] != null)) return false
  return [[input.homeLineup, input.awayPitcher.hand || 'R'], [input.awayLineup, input.homePitcher.hand || 'R']].every(([players, hand]) =>
    (players as Array<{ mlb_id: number }>).every(player => input.batterMatchup[player.mlb_id] != null && ['season','l1','l3','l5','l10'].every(window => input.statcast[player.mlb_id]?.[hand as string]?.[window] != null)))
}
