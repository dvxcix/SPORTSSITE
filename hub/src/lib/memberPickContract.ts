/** Exact immutable inputs used for a decision; compared again under DB locks. */
export function memberPickContract(pick: { sport?: string; game_pk?: string | null; mlb_id?: number | null; player_id?: string | null; pick_type: string; market_side?: string | null; numeric_line?: number | string | null; book?: string | null; line?: string | null; post_id?: string | null; user_id?: string | null }, sport: 'MLB' | 'NFL') {
  return {
    sport, game_pk: pick.game_pk ?? null, mlb_id: pick.mlb_id ?? null, player_id: pick.player_id ?? null,
    pick_type: pick.pick_type, market_side: pick.market_side ?? null,
    numeric_line: pick.numeric_line == null ? null : Number(pick.numeric_line), book: pick.book ?? null, line: pick.line ?? null,
    post_id: pick.post_id ?? null, user_id: pick.user_id ?? null,
  }
}
