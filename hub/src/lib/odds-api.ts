const BASE = 'https://api.the-odds-api.com/v4'
const KEY = process.env.ODDS_API_KEY

export interface OddsGame {
  id: string
  sport_key: string
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: {
    key: string
    title: string
    markets: {
      key: string
      outcomes: { name: string; price: number; point?: number }[]
    }[]
  }[]
}

export async function getMLBOdds(): Promise<OddsGame[]> {
  if (!KEY) return []
  const res = await fetch(
    `${BASE}/sports/baseball_mlb/odds?apiKey=${KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`,
    { next: { revalidate: 300 } }
  )
  if (!res.ok) return []
  return res.json()
}
