import 'server-only'
import { espnInjuryNews, espnRosterNews, mlbTransactionNews, newsName,
  type ESPNInjuries, type ESPNTransaction, type MLBTransaction, type PlayerNews, type PlayerNewsSource } from './nativePlayerNews'
import { applePlayerPortrait } from './appleNotificationArtwork'

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports'
const ESPN_SEARCH = 'https://site.web.api.espn.com/apis/search/v2'
const endpoints = { nba: 'basketball/nba', nfl: 'football/nfl' } as const
export const playerNewsSources: PlayerNewsSource[] = ['nba-injuries', 'nfl-injuries', 'nba-transactions', 'nfl-transactions', 'mlb-transactions']
const hour = 3_600_000

async function feed<T>(url: string, next?: { revalidate: number }) {
  const response = await fetch(url, { ...(next ? { next } : { cache: 'no-store' }), signal: AbortSignal.timeout(6500) })
  if (!response.ok) throw Error('News feed not available')
  return await response.json() as T
}

export async function readPlayerNews(source: PlayerNewsSource, observedAt: number): Promise<PlayerNews[]> {
  if (source === 'mlb-transactions') {
    const day = (at: number) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const { transactions } = await feed<{ transactions?: MLBTransaction[] }>(
      `https://statsapi.mlb.com/api/v1/transactions?sportId=1&startDate=${day(observedAt - 72 * hour)}&endDate=${day(observedAt)}`)
    if (!Array.isArray(transactions)) throw Error('MLB transactions incomplete')
    return mlbTransactionNews(transactions)
  }

  const sport = source.startsWith('nba-') ? 'nba' : 'nfl'
  const base = `${ESPN}/${endpoints[sport]}`
  if (source.endsWith('-injuries')) return espnInjuryNews(sport, await feed<ESPNInjuries>(`${base}/injuries`))

  const recent: ESPNTransaction[] = []
  for (let page = 1; page <= 4; page++) {
    const result = await feed<{ status?: string; transactions?: ESPNTransaction[]; pageCount?: number; pageIndex?: number }>(
      `${base}/transactions?limit=100&page=${page}`)
    if (result.status !== 'success' || !Array.isArray(result.transactions) || result.pageIndex !== page ||
        !Number.isSafeInteger(result.pageCount) || result.transactions.some(row => typeof row.date !== 'string' || !Number.isFinite(Date.parse(row.date)))) {
      throw Error('ESPN transactions incomplete')
    }
    const edge = observedAt - 72 * hour
    const days = result.transactions.map(row => Date.parse(row.date as string))
    if (days.some((value, index) => index > 0 && value > days[index - 1])) throw Error('ESPN transactions out of order')
    recent.push(...result.transactions.filter((_, index) => days[index] >= edge))
    if (days.some(time => time < edge) || page >= result.pageCount!) return espnRosterNews(sport, recent)
  }
  throw Error('ESPN transaction window incomplete')
}

export async function resolvePlayerNewsPortrait(item: PlayerNews): Promise<PlayerNews> {
  const player = item.player
  if (!player || player.headshot || item.sport === 'mlb') return item

  type Result = { displayName?: string; defaultLeagueSlug?: string; image?: { default?: string }; subtitle?: string }
  try {
    const result = await feed<{ results?: { type?: string; contents?: Result[] }[] }>(
      `${ESPN_SEARCH}?query=${encodeURIComponent(player.name)}&limit=8`, { revalidate: 3600 })
    const matching = (result.results ?? []).flatMap(group => group.type === 'player' ? group.contents ?? [] : [])
      .filter(candidate => candidate.defaultLeagueSlug === item.sport && candidate.displayName &&
        newsName(candidate.displayName) === newsName(player.name))
    const teamMatches = matching.filter(candidate => candidate.subtitle && newsName(candidate.subtitle) === newsName(item.team.name))
    const reliable = teamMatches.length ? teamMatches : matching
    if (reliable.length !== 1) return item
    const headshot = applePlayerPortrait(reliable[0].image?.default)
    return headshot ? { ...item, player: { ...player, headshot } } : item
  } catch {
    return item
  }
}
