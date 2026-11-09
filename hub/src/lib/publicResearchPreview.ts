export type PreviewSport = 'nba' | 'nfl'
export const PREVIEW_SPORTS = ['nba', 'nfl'] as const
export const PREVIEW_CONFIG = {
  nba: { label: 'NBA', workspace: 'The Court', path: '/the-paint', market: 'points', title: 'Points', lines: [10, 15, 20, 25, 30, 35] },
  nfl: { label: 'NFL', workspace: 'The Sideline', path: '/the-sideline', market: 'receiving_yards', title: 'Receiving yards', lines: [10, 25, 40, 50, 60, 75] },
} as const

export type PreviewGame = {
  id: string
  date: string
  start: string | null
  away: string
  home: string
  awayScore: number | null
  homeScore: number | null
  state: 'scheduled' | 'started' | 'final'
}
export type PreviewPrice = { line: number; price: number; opening: number | null }
export type PreviewPlayer = { id: number; name: string; team: string; prices: PreviewPrice[] }
export type PreviewBoard = { game: PreviewGame; book: 'FanDuel'; capturedAt: string; players: PreviewPlayer[]; example: boolean }
export type ResearchPreview = { board: PreviewBoard; schedule: PreviewGame[]; date: string; scheduleAvailable: boolean }
export type PreviewContext = { sport: PreviewSport; game: string; date: string; player?: number; line?: number }

export function isPreviewSport(value: unknown): value is PreviewSport {
  return value === 'nba' || value === 'nfl'
}

export function isPublicPreviewPath(path: string) {
  return path === '/preview/nba' || path === '/preview/nfl'
}

export function readPreviewContext(input: Record<string, unknown>): PreviewContext | null {
  const { preview: sport, game, date, player, line } = input
  if (!isPreviewSport(sport) || typeof game !== 'string' || typeof date !== 'string') return null
  if (!(sport === 'nba' ? /^[1-9]\d{0,9}$/ : /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/).test(game)) return null
  const parsedDate = new Date(date + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return null
  const playerId = typeof player === 'string' && /^[1-9]\d{0,9}$/.test(player) ? Number(player) : undefined
  const rung = typeof line === 'string' && /^\d{1,2}$/.test(line) ? Number(line) : undefined
  return { sport, game, date, player: playerId, line: (PREVIEW_CONFIG[sport].lines as readonly number[]).includes(rung ?? -1) ? rung : undefined }
}

function contextQuery(context: PreviewContext) {
  const query = new URLSearchParams({ game: context.game, date: context.date })
  if (context.player) query.set('player', String(context.player))
  if (context.line) query.set('line', String(context.line))
  return query
}

export function previewPricingPath(context: PreviewContext | null) {
  if (!context) return '/pricing'
  const query = contextQuery(context)
  query.set('preview', context.sport)
  return '/pricing?' + query
}

export function previewPagePath(context: PreviewContext) {
  return '/preview/' + context.sport + '?' + contextQuery(context)
}

export function previewWorkspacePath(context: PreviewContext) {
  const query = contextQuery(context)
  if (context.sport === 'nba') {
    query.set('market', 'points')
    query.set('book', 'fanduel')
    query.set('view', 'ladders')
    query.set('panel', 'ladder')
    query.set('type', 'milestone')
  } else {
    query.set('preview', 'nfl')
  }
  return PREVIEW_CONFIG[context.sport].path + '?' + query
}

type SourceQuote = PreviewPrice & { id: number; name: string; team: string }
const validOdds = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) >= 100 && Math.abs(value) <= 100_000

/** Project an explicit public shape and cap the free slice on the server. */
export function selectPreviewPlayers(sport: PreviewSport, game: PreviewGame, quotes: SourceQuote[]): PreviewPlayer[] {
  const lines: readonly number[] = PREVIEW_CONFIG[sport].lines
  const players = new Map<number, PreviewPlayer>()
  const rejectedPlayers = new Set<number>()
  const seen = new Set<string>()
  for (const quote of quotes) {
    if (!Number.isSafeInteger(quote.id) || quote.id < 1 || typeof quote.name !== 'string' || !quote.name.trim()
      || quote.name.length > 80 || ![game.away, game.home].includes(quote.team) || !lines.includes(quote.line) || !validOdds(quote.price)) continue
    const row = players.get(quote.id) ?? { id: quote.id, name: quote.name, team: quote.team, prices: [] }
    if (row.team !== quote.team || row.name !== quote.name) { rejectedPlayers.add(row.id); continue }
    const key = String(quote.id) + ':' + quote.line
    if (seen.has(key)) {
      row.prices = row.prices.filter(price => price.line !== quote.line)
      continue
    }
    seen.add(key)
    row.prices.push({ line: quote.line, price: quote.price, opening: validOdds(quote.opening) ? quote.opening : null })
    players.set(row.id, row)
  }
  const ranked = [...players.values()].filter(row => row.prices.length && !rejectedPlayers.has(row.id))
    .sort((a, b) => b.prices.length - a.prices.length || a.name.localeCompare(b.name))
  return [game.away, game.home].flatMap(team => ranked.filter(row => row.team === team).slice(0, 4))
}
