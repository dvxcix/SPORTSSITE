// League logos, hotlinked from ESPN's CDN — same source/pattern already
// established for the sidebar's MLB section logo (Sidebar.tsx). Verified
// live (curl) before adding each one; Soccer has no single governing-league
// logo (hundreds of leagues, no unified badge) so it's deliberately left
// unmapped rather than guessing a URL — callers fall back to text/emoji.
export const SPORT_LOGOS: Record<string, string> = {
  MLB: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
  NFL: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
  NBA: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
  NHL: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
  MMA: 'https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png',
}

export function sportLogoUrl(sport?: string | null): string | undefined {
  if (!sport) return undefined
  return SPORT_LOGOS[sport.toUpperCase()]
}
