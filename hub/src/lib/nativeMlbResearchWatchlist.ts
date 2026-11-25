import 'server-only'
import { GET as dugout } from '@/app/api/mobile/dugout/route'

type Quote = { book: string; price: number | null; opening: number | null; line: number | null }
type Player = { id: number; name: string; headshot: string; markets: { key: string; label: string; quotes: Quote[] }[] }
type Game = { id: number; isVoid: boolean; home: { code: string }; away: { code: string };
  homeLineup: (Player & { position: string; bats: string })[]; awayLineup: Game['homeLineup'];
  homePitcher: Player | null; awayPitcher: Player | null }

export async function nativeMlbResearchWatchlist(request: Request, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Check your quote selection', status: 400 } as const
  const { date, gameId, playerId, market, book, price } = input as Partial<{
    date: string; gameId: number; playerId: number; market: string; book: string; price: number
  }>
  if (typeof date !== 'string' || date.length !== 10 || typeof gameId !== 'number' || !Number.isSafeInteger(gameId) || gameId <= 0 ||
    typeof playerId !== 'number' || !Number.isSafeInteger(playerId) || playerId <= 0 || typeof market !== 'string' ||
    !/^[a-zA-Z0-9_]{1,60}$/.test(market) || typeof book !== 'string' || !/^[a-z0-9_]{1,35}$/.test(book) ||
    typeof price !== 'number' || !Number.isSafeInteger(price) || Math.abs(price) < 100) {
    return { error: 'Check your quote selection', status: 400 } as const
  }

  const url = new URL('/api/mobile/dugout', request.url)
  url.search = new URLSearchParams({ date, mode: 'pregame' }).toString()
  const response = await dugout(new Request(url, { headers: request.headers }))
  if (!response.ok) return { response } as const
  const board = await response.json() as { date: string; games: Game[] }
  const game = board.date === date ? board.games.find(item => item.id === gameId && !item.isVoid) : null
  if (!game) return { error: 'This matchup is no longer available', status: 404 } as const

  const batter = market !== 'pitcher_strikeouts' ? [...game.awayLineup, ...game.homeLineup].find(item => item.id === playerId) : null
  const owner = game.homePitcher?.id === playerId || game.homeLineup.some(item => item.id === playerId) ? game.home : game.away
  const player = batter ?? [game.homePitcher, game.awayPitcher].find(item => item?.id === playerId)
  const available = player?.markets.find(item => item.key === market)
  const quote = available?.quotes.find(item => item.book === book)
  if (!player || !available || !quote || (quote.price ?? quote.opening) !== price) {
    return { error: 'That MLB quote changed. Refresh the board and try again.', status: 409 } as const
  }
  const label = quote.line != null ? `Over ${quote.line} ${available.label}` : available.label
  return { value: { sport: 'mlb', game_pk: String(gameId), game_date: date, mlb_id: playerId, player_name: player.name,
    team: owner.code, position: batter?.position ?? 'P', bats: batter?.bats ?? null, headshot_url: player.headshot,
    prop_key: available.key, prop_label: available.label, line: label, book: quote.book, odds: price, odds_by_book: { [quote.book]: price } } } as const
}
