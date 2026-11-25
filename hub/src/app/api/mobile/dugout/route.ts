import { NextResponse } from 'next/server'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoPngUrl, MLB_TEAM_COLORS, MLB_TEAM_SECONDARY_COLORS } from '@slipsurge/core/mlbTeamColors'
import { normName, resolveNameEntry } from '@slipsurge/core/nameNorm'
import { hasTierAccess } from '@slipsurge/core/tiers'
import { loadDugoutData, MARKET_BOOK_TO_OPEN_FIELD } from '@/lib/dugoutData'
import type { MlbPublicMovement } from '@/lib/mlbPublicMovement'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { getEffectiveTier } from '@/lib/requireTier'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const revalidate = 0
export const maxDuration = 60

const headers = { 'Cache-Control': 'private, no-store' }
const markets = {
  sa: 'Anytime Home Run', fhr: 'First Home Run', hr2: '2+ Home Runs', hr3: '3+ Home Runs',
  hits: '1+ Hits', hits2: '2+ Hits', hits3: '3+ Hits',
  rbi: '1+ RBI', rbi2: '2+ RBI', rbi3: '3+ RBI',
  tb: '2+ Total Bases', tb3: '3+ Total Bases', tb4: '4+ Total Bases', tb5: '5+ Total Bases',
  singles: '1+ Singles', singles2: '2+ Singles', singles3: '3+ Singles',
  doubles: '1+ Doubles', doubles2: '2+ Doubles', doubles3: '3+ Doubles',
  triples: '1+ Triples', triples2: '2+ Triples', triples3: '3+ Triples',
  runs: '1+ Runs', runs2: '2+ Runs', runs3: '3+ Runs',
  strikeouts: '1+ Batter Strikeouts', strikeouts2: '2+ Batter Strikeouts', strikeouts3: '3+ Batter Strikeouts',
  stolen_bases: '1+ Stolen Bases', stolen_bases2: '2+ Stolen Bases', stolen_bases3: '3+ Stolen Bases',
  hrr: 'Hits + Runs + RBI', hrr3: '3+ Hits + Runs + RBI', pitcher_strikeouts: 'Pitcher Strikeouts',
  laser105: '105+ mph Home Run', laser110: '110+ mph Home Run', moonshot: 'Moonshot',
  pa1: 'First Plate Appearance Home Run', hrMl: 'Home Run + Moneyline',
}

type PriceFields = Record<string, Record<string, number | null> | undefined>
type PublicPick = { player_name: string | null; game_key: string | null; prop_type?: string | null; market?: string | null;
  picks: number | null; movement?: MlbPublicMovement | null }
type Batter = {
  mlb_id: number; name: string; name_norm?: string; team: string; batting_order: number; position: string; bats: string; projected: boolean
  props: PriceFields | null; matrixMatches: { id: string; name: string; color: string }[]
  statcast: unknown; mechanics: unknown; research?: {
    mmByWindow: unknown; bookRankByWindow: unknown; paperRankByWindow: unknown
  } | null
  pregameInputs?: { fhrAvg?: { fd?: number | null } | null; saAvg?: { fd?: number | null; cz?: number | null } | null }
}
type Pitcher = { id: number; name: string; hand: string; props: PriceFields | null }
type DugoutGame = {
  gamePk: number; gameKey: string; gameNum: number; gameDate: string; locked: boolean
  homeAbbr: string; awayAbbr: string; homeTeam: string; awayTeam: string; homeScore?: number; awayScore?: number
  status: string; detailedStatus: string; isVoid: boolean; venue: string
  homePitcher: Pitcher | null; awayPitcher: Pitcher | null; homeLineup: Batter[]; awayLineup: Batter[]
  homeLineupConfirmed: boolean; awayLineupConfirmed: boolean; noHr: { fanduel: number; openingFanduel?: number | null } | null
  researchSnapshot: { unavailable?: boolean; frozen?: boolean; observedAt?: string; startAt?: string }
  outcomes: Record<string, Record<string, number | null>>
  pregameInputs?: { communityPicks?: PublicPick[] }
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) >= 100
}

function quotes(props: PriceFields | null) {
  if (!props) return []
  return Object.entries(markets).flatMap(([key, label]) => {
    const quotes = new Map<string, { book: string; price: number | null; opening: number | null; line: number | null }>()
    for (const [book, price] of Object.entries(props[key] ?? {})) {
      if (!isPrice(price)) continue
      const opening = props.open?.[MARKET_BOOK_TO_OPEN_FIELD[`${key}:${book}`]]
      quotes.set(book, { book, price, opening: isPrice(opening) ? opening : null, line: props[`${key}_line`]?.[book] ?? null })
    }
    for (const [pair, field] of Object.entries(MARKET_BOOK_TO_OPEN_FIELD)) {
      const [market, book] = pair.split(':')
      const opening = props.open?.[field]
      if (market === key && !quotes.has(book) && isPrice(opening)) {
        quotes.set(book, { book, price: null, opening, line: null })
      }
    }
    return quotes.size ? [{ key, label, quotes: [...quotes.values()] }] : []
  })
}

function team(code: string, name: string, score: number | undefined) {
  return { code, name, score, logo: getTeamLogoPngUrl(code), primary: MLB_TEAM_COLORS[code], secondary: MLB_TEAM_SECONDARY_COLORS[code] }
}

function pitcher(value: Pitcher | null) {
  return value && { id: value.id, name: value.name, hand: value.hand, headshot: mlbHeadshot(value.id), markets: quotes(value.props) }
}

function batterCost(player: Batter, archivedResearch: boolean) {
  const props = player.props
  if (!props) return null
  const homeRun = props.sa?.fanduel ?? null
  const double = props.doubles?.fanduel ?? null
  const bases = props.tb4?.fanduel ?? null
  const ratio = (numerator: number | null, denominator: number | null) => numerator != null && denominator != null && denominator !== -100
    ? Math.round((numerator + 100) / (denominator + 100) * 10) / 10 : null
  const powerIndex = ratio(homeRun, double), powerGate = ratio(homeRun, bases)
  const difference = (price: number | null, baseline: number | null | undefined) =>
    archivedResearch && price != null && baseline ? (price - baseline) / baseline : null
  return {
    homeRunVsSeason: difference(homeRun, player.pregameInputs?.saAvg?.fd || player.pregameInputs?.saAvg?.cz),
    firstHomeRunVsSeason: difference(props.fhr?.fanduel ?? null, player.pregameInputs?.fhrAvg?.fd),
    power: powerIndex != null && powerGate != null && powerIndex >= 1.35 && powerIndex <= 1.60 && powerGate <= 3.8,
  }
}

function game(value: DugoutGame, includePublic: boolean, includeCost: boolean) {
  const { gamePk: id, gameKey: key, gameNum: number, gameDate: startsAt, locked, status, detailedStatus, isVoid, venue,
    homeLineupConfirmed, awayLineupConfirmed, noHr, researchSnapshot: snapshot } = value
  const crowd: Record<string, Record<string, PublicPick>> = Object.create(null)
  if (includePublic) {
    for (const row of value.pregameInputs?.communityPicks ?? []) {
      const name = normName(row.player_name ?? '')
      const market = row.prop_type || row.market
      if (!name || !market || row.game_key && row.game_key !== key) continue
      const byMarket = crowd[name] ??= Object.create(null)
      if (!byMarket[market] || row.game_key === key) byMarket[market] = row
    }
  }
  const publicPicks = (player: Batter) => {
    const rows = resolveNameEntry(crowd, player.name_norm || normName(player.name))
    return rows ? Object.fromEntries(Object.entries(rows).flatMap(([market, row]) => row.picks != null && Number.isSafeInteger(row.picks) && row.picks >= 0
      ? [[market, { count: row.picks, movement: row.movement ?? null }]] : [])) : null
  }
  const batter = (player: Batter) => ({
    id: player.mlb_id, name: player.name, team: player.team, order: player.batting_order, position: player.position,
    bats: player.bats, projected: player.projected, headshot: mlbHeadshot(player.mlb_id), markets: quotes(player.props),
    outcome: value.outcomes[player.mlb_id] ?? null,
    matrixMatches: snapshot.unavailable ? [] : player.matrixMatches,
    statcast: snapshot.unavailable ? null : player.statcast,
    mechanics: snapshot.unavailable ? null : player.mechanics,
    mm: snapshot.unavailable ? null : player.research?.mmByWindow ?? null,
    bookRank: snapshot.unavailable ? null : player.research?.bookRankByWindow ?? null,
    paperRank: snapshot.unavailable ? null : player.research?.paperRankByWindow ?? null,
    crowd: publicPicks(player),
    cost: includeCost ? batterCost(player, !snapshot.unavailable) : null,
  })
  const lineup = (players: Batter[]) => players
    .filter(player => !snapshot.unavailable || !snapshot.frozen || !player.projected)
    .map(batter)
  return {
    id, key, number, startsAt, locked, status, detailedStatus, isVoid, venue, snapshot,
    home: team(value.homeAbbr, value.homeTeam, value.homeScore), away: team(value.awayAbbr, value.awayTeam, value.awayScore),
    homeLineupConfirmed, awayLineupConfirmed, noHr, homePitcher: pitcher(value.homePitcher), awayPitcher: pitcher(value.awayPitcher),
    homeLineup: lineup(value.homeLineup), awayLineup: lineup(value.awayLineup),
  }
}

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const allowed = await canViewMlb(account.supabase, account.userId)
  const url = new URL(request.url)
  const query = url.searchParams
  if (query.get('view') === 'access') return NextResponse.json({ allowed }, { headers })
  if (!allowed) return NextResponse.json({ error: 'MLB research is unavailable for this account' }, { status: 403, headers })

  const date = query.get('date') ?? ''
  const mode = query.get('mode') ?? 'pregame'
  const day = new Date(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== date ||
      (mode !== 'pregame' && mode !== 'live')) {
    return NextResponse.json({ error: 'Choose a valid slate date and research mode' }, { status: 400, headers })
  }

  const gate = await getEffectiveTier()
  if (gate.error) return gate.error
  if (gate.userId !== account.userId || !gate.tier) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })
  }

  url.search = new URLSearchParams({ date, mode, research: '1' }).toString()
  const response = await loadDugoutData(new Request(url), { tier: gate.tier, userId: account.userId })
  if (!response.ok) return response
  const board = await response.json() as { date: string; games: DugoutGame[] }
  const publicAccess = hasTierAccess(gate.tier, 'advanced')
  const batterCostAccess = hasTierAccess(gate.tier, 'ultimate')
  return NextResponse.json({ date: board.date, mode, publicAccess, batterCostAccess,
    games: board.games.map(value => game(value, publicAccess, batterCostAccess)) }, { headers })
}
