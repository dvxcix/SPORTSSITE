/** Cosmetic fallback from the directory's own ESPN identity. No name matching,
 * network lookup, or changes to historical research. */
export function nflPlayerPortrait(player: { headshot?: string | null; espn_id?: string | number | null }): string | null {
  const source = player.headshot?.trim()
  if (source?.startsWith('https://')) return source
  const id = String(player.espn_id ?? '').trim()
  return /^[1-9]\d{0,9}$/.test(id) ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png` : null
}
