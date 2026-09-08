import 'server-only'

import { bdlHeaders } from '@/lib/balldontlie'
import type {
  NflGameLineBook,
  NflMarketOffer,
  NflOddsPlayer,
  NflOddsValue,
  NflPlayerMarket,
  SidelineOddsBoard,
} from '@/lib/nflOddsTypes'
export { mergeNflOddsBoards, nflOddsPayloadHash } from '@/lib/nflOddsLogic'

const NFL_BDL_BASE = 'https://api.balldontlie.io/nfl/v1'
const BOOK_ORDER = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'fanatics', 'betrivers', 'kalshi', 'polymarket']
const TEAM_ALIASES: Record<string, string> = { LA: 'LAR', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR', WAS: 'WSH' }

type ApiTeam = { id: number; abbreviation: string; full_name?: string }
export type ApiGame = {
  id: number
  season: number
  week: number
  date: string
  postseason: boolean
  home_team: ApiTeam
  visitor_team: ApiTeam
}
type ApiGameOdds = {
  game_id: number
  vendor: string
  spread_home_value?: string | number | null
  spread_home_odds?: number | null
  spread_away_value?: string | number | null
  spread_away_odds?: number | null
  moneyline_home_odds?: number | null
  moneyline_away_odds?: number | null
  total_value?: string | number | null
  total_over_odds?: number | null
  total_under_odds?: number | null
  updated_at?: string
  opened_at?: string
}
type ApiProp = {
  game_id: number
  player_id: number
  vendor: string
  prop_type: string
  line_value?: string | number | null
  market: { type: 'milestone' | 'over_under'; odds?: number; over_odds?: number; under_odds?: number }
  updated_at?: string
  opened_at?: string
}
type ApiPlayer = {
  id: number
  first_name: string
  last_name: string
  position_abbreviation?: string
  jersey_number?: number | string | null
  team?: { id?: number; abbreviation?: string }
}

export type NflBdlPlayerStat = {
  player: ApiPlayer
  team?: ApiTeam
  game?: { id: number; date?: string; week?: number; season?: number; postseason?: boolean }
  receptions?: number | null
  receiving_targets?: number | null
  receiving_yards?: number | null
  receiving_touchdowns?: number | null
  rushing_attempts?: number | null
  rush_attempts?: number | null
  rushing_yards?: number | null
  rushing_touchdowns?: number | null
  passing_attempts?: number | null
  passing_completions?: number | null
  passing_yards?: number | null
  passing_touchdowns?: number | null
}
export type SidelineGameRef = {
  id: string
  season: number
  week: number
  gameType: string
  gameday: string
  away: { abbr: string }
  home: { abbr: string }
}

const PROP_META: Record<string, [NflPlayerMarket['label'], NflPlayerMarket['category']]> = {
  anytime_td: ['Anytime touchdown', 'touchdowns'],
  anytime_td_1h: ['Anytime TD · 1st half', 'touchdowns'],
  anytime_td_1q: ['Anytime TD · 1st quarter', 'touchdowns'],
  anytime_td_2h: ['Anytime TD · 2nd half', 'touchdowns'],
  anytime_td_2q: ['Anytime TD · 2nd quarter', 'touchdowns'],
  anytime_td_3q: ['Anytime TD · 3rd quarter', 'touchdowns'],
  anytime_td_4q: ['Anytime TD · 4th quarter', 'touchdowns'],
  first_td: ['First touchdown', 'touchdowns'],
  passing_yards: ['Passing yards', 'passing'],
  passing_yards_1h: ['Passing yards · 1st half', 'passing'],
  passing_yards_1q: ['Passing yards · 1st quarter', 'passing'],
  passing_yards_2q: ['Passing yards · 2nd quarter', 'passing'],
  passing_yards_3q: ['Passing yards · 3rd quarter', 'passing'],
  passing_yards_4q: ['Passing yards · 4th quarter', 'passing'],
  passing_tds: ['Passing touchdowns', 'passing'],
  passing_tds_1h: ['Passing TDs · 1st half', 'passing'],
  passing_attempts: ['Pass attempts', 'passing'],
  passing_completions: ['Pass completions', 'passing'],
  longest_pass: ['Longest completion', 'passing'],
  interceptions: ['Interceptions thrown', 'passing'],
  receiving_yards: ['Receiving yards', 'receiving'],
  receiving_yards_1h: ['Receiving yards · 1st half', 'receiving'],
  receiving_yards_1q: ['Receiving yards · 1st quarter', 'receiving'],
  receiving_yards_2q: ['Receiving yards · 2nd quarter', 'receiving'],
  receiving_yards_3q: ['Receiving yards · 3rd quarter', 'receiving'],
  receiving_yards_4q: ['Receiving yards · 4th quarter', 'receiving'],
  receptions: ['Receptions', 'receiving'],
  longest_reception: ['Longest reception', 'receiving'],
  rushing_yards: ['Rushing yards', 'rushing'],
  rushing_yards_1h: ['Rushing yards · 1st half', 'rushing'],
  rushing_attempts: ['Rush attempts', 'rushing'],
  rushing_receiving_yards: ['Rush + receiving yards', 'rushing'],
  longest_rush: ['Longest rush', 'rushing'],
  fg_made: ['Field goals made', 'kicking'],
  fg_made_1h: ['Field goals · 1st half', 'kicking'],
  kicking_points: ['Kicking points', 'kicking'],
}

function humanizePropType(propType: string) {
  return propType
    .split('_')
    .map(word => ({ td: 'TD', tds: 'TDs', fg: 'FG' }[word] ?? `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(' ')
}

function propMeta(propType: string): [NflPlayerMarket['label'], NflPlayerMarket['category']] {
  const explicit = PROP_META[propType]
  if (explicit) return [explicit[0].replaceAll('\uFFFD', '·'), explicit[1]]
  const key = propType.toLowerCase()
  const category: NflPlayerMarket['category'] = key.includes('pass') || key.includes('completion') || key.includes('interception')
    ? 'passing'
    : key.includes('receiv') || key.includes('reception') || key.includes('target')
      ? 'receiving'
      : key.includes('rush') || key.includes('carry')
        ? 'rushing'
        : key.includes('touchdown') || key.includes('_td') || key.endsWith('td')
          ? 'touchdowns'
          : key.includes('kick') || key.includes('field_goal') || key.includes('extra_point')
            ? 'kicking'
            : key.includes('tackle') || key.includes('sack') || key.includes('defen')
              ? 'defense'
              : 'other'
  return [humanizePropType(propType), category]
}

function bookRank(vendor: string) {
  const rank = BOOK_ORDER.indexOf(vendor)
  return rank < 0 ? BOOK_ORDER.length : rank
}

function numeric(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function canonicalTeam(value: string) {
  const upper = value.toUpperCase()
  return TEAM_ALIASES[upper] ?? upper
}

function apiValue(row: ApiProp): NflOddsValue {
  return row.market.type === 'milestone'
    ? { odds: numeric(row.market.odds) ?? undefined }
    : { over: numeric(row.market.over_odds) ?? undefined, under: numeric(row.market.under_odds) ?? undefined }
}

function valuePresent(value: NflOddsValue | null) {
  return value != null && (value.odds != null || value.over != null || value.under != null)
}

async function bdlGet<T>(path: string, freshness: 'live' | 'reference' = 'live'): Promise<T[]> {
  const response = await fetch(`${NFL_BDL_BASE}${path}`, {
    headers: bdlHeaders,
    ...(freshness === 'live' ? { cache: 'no-store' as const } : { next: { revalidate: 3600 } }),
  })
  if (!response.ok) throw new Error(`BDL NFL ${path} returned ${response.status}`)
  const payload = await response.json()
  return payload.data ?? []
}

async function bdlGetPaged<T>(path: string, maxPages = 20): Promise<T[]> {
  const rows: T[] = []
  let cursor: string | null = null
  for (let page = 0; page < maxPages; page += 1) {
    const joiner = path.includes('?') ? '&' : '?'
    const response: Response = await fetch(`${NFL_BDL_BASE}${path}${cursor ? `${joiner}cursor=${encodeURIComponent(cursor)}` : ''}`, {
      headers: bdlHeaders,
      next: { revalidate: 3600 },
    })
    if (!response.ok) throw new Error(`BDL NFL ${path} returned ${response.status}`)
    const payload: { data?: T[]; meta?: { next_cursor?: string | number | null } } = await response.json()
    rows.push(...(payload.data ?? []))
    const nextCursor: string | number | null | undefined = payload.meta?.next_cursor
    if (nextCursor == null || nextCursor === '') break
    cursor = String(nextCursor)
  }
  return rows
}

export async function getNflBdlGames(season: number, week: number): Promise<ApiGame[]> {
  return bdlGet<ApiGame>(`/games?seasons[]=${season}&weeks[]=${week}&per_page=100`, 'reference')
}

export async function getNflBdlCurrentSeasonStats(season: number, teamIds: number[]): Promise<NflBdlPlayerStat[]> {
  const uniqueTeams = Array.from(new Set(teamIds.filter(id => Number.isFinite(id) && id > 0)))
  if (!uniqueTeams.length) return []
  const params = new URLSearchParams({ per_page: '100' })
  params.append('seasons[]', String(season))
  params.append('season_types[]', '1')
  params.append('season_types[]', '2')
  uniqueTeams.forEach(id => params.append('team_ids[]', String(id)))
  return bdlGetPaged<NflBdlPlayerStat>(`/stats?${params}`)
}

export function matchNflBdlGame(games: ApiGame[], game: SidelineGameRef): ApiGame | null {
  const away = canonicalTeam(game.away.abbr)
  const home = canonicalTeam(game.home.abbr)
  const candidates = games.filter(candidate =>
    canonicalTeam(candidate.visitor_team.abbreviation) === away
    && canonicalTeam(candidate.home_team.abbreviation) === home
  )
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]
  const target = new Date(`${game.gameday}T12:00:00Z`).getTime()
  return candidates.reduce((closest, candidate) =>
    Math.abs(new Date(candidate.date).getTime() - target) < Math.abs(new Date(closest.date).getTime() - target)
      ? candidate
      : closest
  )
}

async function getPlayers(ids: number[]): Promise<Record<number, ApiPlayer>> {
  const players: Record<number, ApiPlayer> = {}
  const unique = Array.from(new Set(ids)).filter(Boolean)
  for (let index = 0; index < unique.length; index += 100) {
    const params = new URLSearchParams({ per_page: '100' })
    unique.slice(index, index + 100).forEach(id => params.append('player_ids[]', String(id)))
    const rows = await bdlGet<ApiPlayer>(`/players?${params}`, 'reference')
    rows.forEach(player => { players[player.id] = player })
  }
  return players
}

function buildGameLines(current: ApiGameOdds[], opening: ApiGameOdds[]): NflGameLineBook[] {
  const openingByVendor = new Map(opening.map(row => [row.vendor, row]))
  const currentByVendor = new Map(current.map(row => [row.vendor, row]))
  return Array.from(new Set([...currentByVendor.keys(), ...openingByVendor.keys()]))
    .map(vendor => currentByVendor.get(vendor) ?? openingByVendor.get(vendor)!)
    .map(row => {
      const opened = openingByVendor.get(row.vendor)
      const values = (source?: ApiGameOdds): Omit<NflGameLineBook, 'vendor' | 'opening' | 'updatedAt'> => ({
        spreadHome: numeric(source?.spread_home_value),
        spreadHomeOdds: numeric(source?.spread_home_odds),
        spreadAway: numeric(source?.spread_away_value),
        spreadAwayOdds: numeric(source?.spread_away_odds),
        moneylineHome: numeric(source?.moneyline_home_odds),
        moneylineAway: numeric(source?.moneyline_away_odds),
        total: numeric(source?.total_value),
        totalOverOdds: numeric(source?.total_over_odds),
        totalUnderOdds: numeric(source?.total_under_odds),
      })
      return {
        vendor: row.vendor,
        ...values(row),
        opening: opened ? values(opened) : null,
        updatedAt: row.updated_at ?? null,
        isOpeningOnly: !currentByVendor.has(row.vendor),
      }
    })
    .sort((a, b) => bookRank(a.vendor) - bookRank(b.vendor))
}

function buildPlayers(current: ApiProp[], opening: ApiProp[], players: Record<number, ApiPlayer>): NflOddsPlayer[] {
  const openingByKey = new Map<string, ApiProp[]>()
  opening.forEach(row => {
    const key = `${row.player_id}:${row.vendor}:${row.prop_type}`
    const rows = openingByKey.get(key) ?? []
    rows.push(row)
    openingByKey.set(key, rows)
  })
  const grouped = new Map<number, Map<string, NflPlayerMarket>>()

  const currentKeys = new Set(current.map(row => `${row.player_id}:${row.vendor}:${row.prop_type}:${numeric(row.line_value) ?? ''}`))
  const rows = [...current, ...opening.filter(row => !currentKeys.has(`${row.player_id}:${row.vendor}:${row.prop_type}:${numeric(row.line_value) ?? ''}`))]

  for (const row of rows) {
    const meta = propMeta(row.prop_type)
    const line = numeric(row.line_value)
    const marketKey = `${row.prop_type}:${line ?? ''}`
    const playerMarkets = grouped.get(row.player_id) ?? new Map<string, NflPlayerMarket>()
    const market = playerMarkets.get(marketKey) ?? {
      key: marketKey,
      propType: row.prop_type,
      label: meta[0],
      category: meta[1],
      line,
      offers: [],
    }
    const openingCandidates = openingByKey.get(`${row.player_id}:${row.vendor}:${row.prop_type}`) ?? []
    const opened = openingCandidates.find(candidate => numeric(candidate.line_value) === line)
      ?? [...openingCandidates].sort((a, b) => Math.abs((numeric(a.line_value) ?? line ?? 0) - (line ?? 0)) - Math.abs((numeric(b.line_value) ?? line ?? 0) - (line ?? 0)))[0]
    const openingValue = opened ? apiValue(opened) : null
    const offer: NflMarketOffer = {
      vendor: row.vendor,
      line,
      openingLine: numeric(opened?.line_value),
      type: row.market.type,
      current: apiValue(row),
      opening: valuePresent(openingValue) ? openingValue : null,
      updatedAt: row.updated_at ?? null,
      isOpeningOnly: !currentKeys.has(`${row.player_id}:${row.vendor}:${row.prop_type}:${line ?? ''}`),
    }
    const existingIndex = market.offers.findIndex(candidate => candidate.vendor === offer.vendor)
    if (existingIndex >= 0) market.offers[existingIndex] = offer
    else market.offers.push(offer)
    market.offers.sort((a, b) => bookRank(a.vendor) - bookRank(b.vendor))
    playerMarkets.set(marketKey, market)
    grouped.set(row.player_id, playerMarkets)
  }

  return Array.from(grouped.entries()).map(([id, markets]) => {
    const player = players[id]
    return {
      id,
      teamId: player?.team?.id ?? null,
      name: player ? `${player.first_name} ${player.last_name}`.trim() : `Player #${id}`,
      team: player?.team?.abbreviation ?? '',
      position: player?.position_abbreviation ?? '',
      jersey: numeric(player?.jersey_number),
      markets: Array.from(markets.values()).sort((a, b) => a.label.localeCompare(b.label) || (a.line ?? 0) - (b.line ?? 0)),
    }
  }).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name))
}

export async function getLiveNflOddsBoard(game: SidelineGameRef, knownGames?: ApiGame[]): Promise<SidelineOddsBoard> {
  const games = knownGames ?? await getNflBdlGames(game.season, game.week)
  const matched = matchNflBdlGame(games, game)
  if (!matched) return { bdlGameId: null, status: 'unavailable', capturedAt: null, source: 'none', gameLines: [], players: [] }

  const [gameLines, openingLines, props, openingProps] = await Promise.all([
    bdlGet<ApiGameOdds>(`/odds?game_ids[]=${matched.id}&per_page=100`),
    bdlGet<ApiGameOdds>(`/odds/opening?game_ids[]=${matched.id}&per_page=100`, 'reference'),
    bdlGet<ApiProp>(`/odds/player_props?game_id=${matched.id}`),
    bdlGet<ApiProp>(`/odds/player_props/opening?game_id=${matched.id}`, 'reference'),
  ])
  const playerLookup = await getPlayers([...props, ...openingProps].map(row => row.player_id))
  const board: SidelineOddsBoard = {
    bdlGameId: matched.id,
    status: gameLines.length || props.length ? 'ready' : 'not-posted',
    capturedAt: new Date().toISOString(),
    source: 'live',
    gameLines: buildGameLines(gameLines, openingLines),
    players: buildPlayers(props, openingProps, playerLookup),
  }
  return board
}

export async function getOpeningNflOddsBoard(game: SidelineGameRef, knownGames?: ApiGame[]): Promise<SidelineOddsBoard> {
  const games = knownGames ?? await getNflBdlGames(game.season, game.week)
  const matched = matchNflBdlGame(games, game)
  if (!matched) return { bdlGameId: null, status: 'unavailable', capturedAt: null, source: 'none', gameLines: [], players: [] }

  const [openingLines, openingProps] = await Promise.all([
    bdlGet<ApiGameOdds>(`/odds/opening?game_ids[]=${matched.id}&per_page=100`, 'reference'),
    bdlGet<ApiProp>(`/odds/player_props/opening?game_id=${matched.id}`, 'reference'),
  ])
  const playerLookup = await getPlayers(openingProps.map(row => row.player_id))
  return {
    bdlGameId: matched.id,
    status: openingLines.length || openingProps.length ? 'ready' : 'not-posted',
    capturedAt: new Date().toISOString(),
    source: 'opening',
    gameLines: buildGameLines([], openingLines),
    players: buildPlayers([], openingProps, playerLookup),
  }
}
