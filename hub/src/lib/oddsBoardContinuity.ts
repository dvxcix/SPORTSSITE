// Last-seen display is local to this view. It does not extend a server proof.
export const ODDS_BOARD_LAST_SEEN_MS = 5 * 60_000

export function canShowLastSeenOdds(now:number, verifiedAt:number, confirmedPhaseChange:boolean) {
  return !confirmedPhaseChange && verifiedAt > 0 && verifiedAt <= now && now < verifiedAt + ODDS_BOARD_LAST_SEEN_MS
}
