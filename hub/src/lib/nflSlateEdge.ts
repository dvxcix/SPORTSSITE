export const NFL_SLATE_EDGE_MARKETS = [
  { key: 'anytime_td', label: 'Anytime TD', short: 'ATD', family: 'touchdown' },
  { key: 'first_td', label: 'First TD', short: 'FTD', family: 'touchdown' },
  { key: 'receiving_yards', label: 'Receiving Yards', short: 'REC YDS', family: 'receiving' },
  { key: 'receptions', label: 'Receptions', short: 'REC', family: 'receiving' },
  { key: 'rushing_yards', label: 'Rushing Yards', short: 'RUSH YDS', family: 'rushing' },
  { key: 'passing_yards', label: 'Passing Yards', short: 'PASS YDS', family: 'passing' },
] as const

export type NflSlateEdgeMarketKey = (typeof NFL_SLATE_EDGE_MARKETS)[number]['key']

export type NflSlateEdgeMarket = {
  label: string
  line: number | null
  openingLine: number | null
  odds: number | null
  openingOdds: number | null
  vendor: string | null
  picks: number | null
  bookGap: number | null
  books: string[]
}

export type NflSlateEdgeEntry = {
  id: string
  gameId: string
  gameLabel: string
  awayAbbr: string
  awayLogo: string | null
  homeAbbr: string
  homeLogo: string | null
  team: string
  teamLogo: string | null
  name: string
  position: string
  headshot: string | null
  games: number
  score: Record<NflSlateEdgeMarketKey, number | null>
  mm: Record<NflSlateEdgeMarketKey, number | null>
  markets: Record<NflSlateEdgeMarketKey, NflSlateEdgeMarket>
  volume: number | null
  redZone: number | null
  breakaway: number | null
  evidence: number | null
  roleShare: number | null
  redZoneLooks: number | null
  explosivePlays: number | null
  dvp: Record<string, number>
}

export type NflSlateEdgePayload = {
  date: string
  sampleLabel: string
  games: Array<{
    id: string
    label: string
    awayAbbr: string
    awayLogo: string | null
    homeAbbr: string
    homeLogo: string | null
  }>
  entries: NflSlateEdgeEntry[]
}
