import 'server-only'
import { createHash } from 'node:crypto'
import { bdlHeaders } from '@/lib/balldontlie'
import { nbaCompactStat, nbaAverage, nbaDate, nbaMinutes, nbaName, nbaSample, nbaToday, type PaintBoard, type PaintGame, type PaintGameOdds, type PaintPlayer, type PaintProp, type PaintRoster, type PaintStat, type PaintTeam } from './nbaPaint'
import type { PaintScouting } from './nbaResearch'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaAttachOpenings } from './nbaOddsHistory'
import { getNbaQuoteOpenings } from './nbaOddsHistoryData'
import { getNbaFirstOddsForMode } from './nbaFirstBasketOddsData'
import { nbaGameFinal, nbaGameStart, nbaLiveOpen, nbaPregameOpen, nbaQuoteInMode, type NbaOddsMode } from './nbaOddsMode'
import { getNbaPhaseSnapshot } from './nbaOddsPhaseData'
import { getNbaOddsGame } from './nbaOddsClockData'
import { nbaNormalizePrimaryProps } from './nbaPrimaryProps'
import { getNbaSupplementalProps, nbaMergePropSources, nbaSupplementalQuote, type NbaSupplementalSnapshot } from './nbaSupplementalProps'
import { getNbaBookPropEntries, nbaBookPropsSupplement } from './nbaBookPropsData'
import { nbaPregameResearch, readNbaPregameResearch } from './nbaPregameResearchData'

const BASE = 'https://api.balldontlie.io'
type Page<T> = { data: T[]; meta?: { next_cursor?: number | null } }
export class PaintProviderError extends Error { constructor(public endpoint: string, public status: number) { super(`NBA data unavailable (${status})`); this.name = 'PaintProviderError' } }
async function bdl<T>(path: string, ttl = 120): Promise<Page<T>> {
  // The shared lease, not a member request or framework stale revalidation,
  // owns source refreshes. Hash only the public query, never credentials.
  return (await nbaSharedCache(`provider:v1:${ttl}:${createHash('sha256').update(path).digest('hex')}`, ttl, 0, async () => {
    const response = await fetch(`${BASE}${path}`, { headers: bdlHeaders, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
    if (!response.ok) throw new PaintProviderError(path.split('?')[0], response.status)
    const payload = await response.json()
    if (!Array.isArray(payload.data)) throw new PaintProviderError(path.split('?')[0], 502)
    return payload as Page<T>
  }, 25)).value
}
async function pages<T>(path: string, ttl: number, limit = 24, deadline = Infinity) {
  const rows: T[] = []; const cursors = new Set<number>(); let cursor: number | null = null
  for (let page = 0; page < limit; page++) {
    if (Date.now() >= deadline) return { rows, complete: false }
    const result: Page<T> = await bdl<T>(`${path}${cursor == null ? '' : `&cursor=${cursor}`}`, ttl)
    rows.push(...result.data)
    const next = result.meta?.next_cursor
    if (next == null) return { rows, complete: true }
    if (cursors.has(next)) return { rows, complete: false }
    cursors.add(next); cursor = next
  }
  return { rows, complete: false }
}
const espnCode = (abbr: string) => ({ GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah' }[abbr] ?? abbr.toLowerCase())
type EspnAthlete = { fullName: string; headshot?: { href?: string }; athletes?: EspnAthlete[] }
export async function artwork(abbr: string) {
  const cached = await nbaSharedCache(`artwork:v2:${abbr}`, 3600, 86400, async () => {
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnCode(abbr)}/roster`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error('Roster images unavailable')
  const json = await response.json() as { athletes?: EspnAthlete[]; team?: { logo?: string; color?: string } }
  const athletes = (json.athletes ?? []).flatMap(a => a.athletes ?? [a])
  // Resolve within the exact team, require one exact normalized-name match.
  const headshots = new Map<string, string | null>()
  for (const athlete of athletes) { const name = nbaName(athlete.fullName); headshots.set(name, headshots.has(name) ? null : athlete.headshot?.href ?? null) }
  return { headshots: [...headshots], logo: json.team?.logo ?? null }
  }, 25)
  return { headshots: new Map(cached.value.headshots), logo: cached.value.logo }
}
export function paintTeamLogo(abbr: string) { return `https://a.espncdn.com/i/teamlogos/nba/500/${espnCode(abbr)}.png` }
export async function getPaintSchedule(requestedDate?: string) {
  const date = nbaDate(requestedDate); const start = new Date(`${date}T12:00:00Z`); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7)
  const result = await pages<PaintGame>(`/v1/games?start_date=${date}&end_date=${end.toISOString().slice(0, 10)}&season_type=regular&per_page=100`, 120, 2)
  const all = result.rows.sort((a, b) => (a.datetime ?? a.status).localeCompare(b.datetime ?? b.status))
  const selectedDate = all.some(g => g.date === date) ? date : all[0]?.date ?? date
  return { date: selectedDate, requestedDate: date, games: all.filter(g => g.date === selectedDate), days: [...new Set(all.map(g => g.date))], complete: result.complete }
}
export async function getPaintGame(id: number, fresh = false): Promise<PaintGame> {
  const game = fresh ? await loadPaintGame(id) : (await nbaSharedCache(`game:v1:${id}`, 15, 0, () => loadPaintGame(id), 25)).value
  return getNbaOddsGame(game)
}
async function loadPaintGame(id: number) {
  const response = await fetch(`${BASE}/v1/games/${id}`, { headers: bdlHeaders, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new PaintProviderError('game', response.status)
  const json = await response.json(); const game = json.data ?? json
  if (game.id !== id || !game.home_team || !game.visitor_team) throw new PaintProviderError('game', 502)
  return game as PaintGame
}
export async function getPaintIdentity(id: number) {
  return (await nbaSharedCache(`player-identity:v1:${id}`, 300, 0, async () => {
  const response = await fetch(`${BASE}/v1/players/${id}`, { headers: bdlHeaders, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new PaintProviderError('player', response.status)
  const json = await response.json(); const player = json.data ?? json
  if (player.id !== id || !player.team) throw new PaintProviderError('player', 502)
  return player as PaintRoster
  }, 25)).value
}
export async function getPaintFinalStats(id: number, period = 0) { if (period !== 0 && period !== 1) throw new Error('Unsupported NBA period'); const result = await pages<PaintStat>(`/v1/stats?game_ids[]=${id}${period ? '&period=1' : ''}&per_page=100`, 60, 2); return { ...result, rows: result.rows.map(row => ({ ...row, period })) } }
export async function getPaintRoster(game:PaintGame){
  const result=await pages<PaintRoster>(`/v1/players/active?team_ids[]=${game.home_team.id}&team_ids[]=${game.visitor_team.id}&per_page=100`,300,2)
  if(!result.complete)throw new Error('Roster incomplete')
  return result.rows.filter(p=>[game.home_team.id,game.visitor_team.id].includes(p.team.id))
}
async function getPaintPrimaryProps(gameId: number, fresh = false): Promise<PaintProp[]> {
  if (!fresh) return nbaNormalizePrimaryProps((await bdl<PaintProp>(`/v2/odds/player_props?game_id=${gameId}`, 30)).data)
  const response = await fetch(`${BASE}/v2/odds/player_props?game_id=${gameId}`, { headers: bdlHeaders, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new PaintProviderError('props', response.status)
  const json = await response.json(); if (!Array.isArray(json.data)) throw new PaintProviderError('props', 502)
  return nbaNormalizePrimaryProps(json.data)
}
export async function getPaintPropSnapshot(game: PaintGame, mode: NbaOddsMode = 'pregame', freshPrimary = false) {
  const [primary, supplemental, bookEntries] = await Promise.allSettled([getPaintPrimaryProps(game.id, freshPrimary), getNbaSupplementalProps(game, mode),mode==='pregame'?getNbaBookPropEntries(game):Promise.resolve([])])
  const coverage: Pick<NbaSupplementalSnapshot, 'complete' | 'deferred' | 'accepted' | 'unmatched' | 'stale' | 'eventMatched' | 'applicable' | 'observedAt' | 'diagnostics'> = supplemental.status === 'fulfilled'
    ? { complete: supplemental.value.complete, deferred: supplemental.value.deferred, accepted: supplemental.value.accepted, unmatched: supplemental.value.unmatched, stale: supplemental.value.stale, eventMatched: supplemental.value.eventMatched, applicable: supplemental.value.applicable, observedAt: supplemental.value.observedAt, diagnostics: supplemental.value.diagnostics }
    : { complete: false, accepted: 0, unmatched: 0, stale: 0, eventMatched: false, applicable: true, observedAt: new Date().toISOString() }
  // An unlisted future event is normal. It may not erase a supplement already
  // captured for this phase; the bounded latest frame establishes that history.
  const missingSource = coverage.deferred === true || !coverage.applicable
  const priorSupplement = missingSource ? await getNbaPhaseSnapshot(game, mode).then(snapshot => snapshot.props.some(nbaSupplementalQuote)).catch(() => true) : false
  if (!coverage.applicable && priorSupplement) { coverage.complete = false; coverage.deferred = true }
  const apiComplete = primary.status === 'fulfilled' && (coverage.complete || coverage.deferred === true && !priorSupplement)
  const apiProps=nbaMergePropSources(primary.status==='fulfilled'?primary.value:[],supplemental.status==='fulfilled'?supplemental.value.props:[])
  const book=bookEntries.status==='fulfilled'?nbaBookPropsSupplement(game,apiProps,bookEntries.value):{props:[] as PaintProp[],complete:false}
  if(!book.complete){coverage.complete=false;coverage.deferred=false}
  const complete=apiComplete&&book.complete
  return { props: nbaMergePropSources('retainedPrimary' in book ? book.retainedPrimary ?? apiProps : apiProps,book.props), complete, primaryComplete: primary.status === 'fulfilled', coverage, issues: primary.status === 'fulfilled' && book.complete && (complete || coverage.deferred) ? [] : ['Some sportsbook prices unavailable'] }
}
export async function getPaintProps(gameId: number, fresh = false): Promise<PaintProp[]> {
  const game = await getPaintGame(gameId)
  const mode = nbaLiveOpen(game) ? 'live' : 'pregame'
  if (!nbaPregameOpen(game) && !nbaLiveOpen(game)) return (await getNbaPhaseSnapshot(game, mode)).props
  return (await getPaintPropSnapshot(game, mode, fresh)).props
}
export async function getPaintGameOdds(gameId: number, fresh = false): Promise<PaintGameOdds[]> {
  if (!fresh) return (await bdl<PaintGameOdds>(`/v2/odds?game_ids[]=${gameId}`, 30)).data.filter(offer => offer.game_id == null || offer.game_id === gameId)
  const response = await fetch(`${BASE}/v2/odds?game_ids[]=${gameId}`, { headers: bdlHeaders, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new PaintProviderError('game odds', response.status)
  const json = await response.json(); if (!Array.isArray(json.data)) throw new PaintProviderError('game odds', 502)
  if (json.data.some((offer: PaintGameOdds) => offer.game_id != null && offer.game_id !== gameId)) throw new PaintProviderError('game odds identity', 502)
  return json.data
}
type Average = { player: { id: number }; stats: Record<string, number | null> }
export async function getPaintScouting(game: PaintGame, mode: NbaOddsMode = 'pregame'): Promise<PaintScouting> {
  game = await getNbaOddsGame(game)
  const load = async () => {
    const cached = await nbaSharedCache(`scouting:v1:${game.id}:${nbaToday()}`, 3600, 3600, () => loadPaintScouting(game))
    if (mode === 'pregame' && !scoutingComplete(cached.value)) {
      const prior = await readNbaPregameResearch<PaintScouting>(game, 'scouting:v1')
      if (prior && scoutingComplete(prior.value)) return { value: prior.value, observedAt: prior.observedAt }
    }
    return { value: { ...cached.value, fetchedAt: cached.fetchedAt, issues: [...cached.value.issues, ...(cached.stale ? ['Tracking refresh delayed; showing last captured sample'] : [])] }, observedAt: cached.fetchedAt }
  }
  if (mode === 'live') {
    if (!nbaPregameOpen(game)) return loadPaintScouting(game)
    return (await load()).value
  }
  // Closed pregame research comes only from the retained observation. Never
  // substitute current season-end profiles for a missing pretip snapshot.
  const snapshot = await nbaPregameResearch(game, 'scouting:v1', load)
  return { ...snapshot.value, fetchedAt: snapshot.observedAt, researchSnapshot: { observedAt: snapshot.observedAt, source: snapshot.source, frozen: snapshot.frozen } }
}
function scoutingComplete(value: PaintScouting) {
  return value.players.length > 0 && value.issues.every(issue => issue === 'Tracking refresh delayed; showing last captured sample')
}
async function loadPaintScouting(game: PaintGame): Promise<PaintScouting> {
  // Full-season tracking must never leak future information into a historical board.
  if ((game.date < nbaToday() || game.status_state === 'final' || game.status === 'Final' || game.status_state === 'in_progress' || game.period > 0 || !!game.datetime && Date.parse(game.datetime) <= Date.now())) return { season: game.season, fetchedAt: new Date().toISOString(), players: [], issues: ['Full-season tracking is unavailable for historical matchups.'] }
  const roster = await pages<PaintRoster>(`/v1/players/active?team_ids[]=${game.home_team.id}&team_ids[]=${game.visitor_team.id}&per_page=100`, 3600, 2)
  const ids = [...new Set(roster.rows.filter(p=>[game.home_team.id,game.visitor_team.id].includes(p.team.id)).map(p=>p.id))]
  if(!ids.length)throw new Error('No roster')
  const query=ids.map(id=>`player_ids[]=${id}`).join('&')
  const current=await bdl<Average>(`/nba/v1/season_averages/general?${query}&season=${game.season}&season_type=regular&type=base&per_page=100`,900)
  const season=current.data.some(p=>(p.stats.gp??0)>0)?game.season:game.season-1
  const feeds=[['advanced','general','advanced'],['passing','tracking','passing'],['rebounding','tracking','rebounding'],['drives','tracking','drives']] as const
  const results=await Promise.allSettled(feeds.map(([,category,type])=>bdl<Average>(`/nba/v1/season_averages/${category}?${query}&season=${season}&season_type=regular&type=${type}&per_page=100`,3600)))
  const issues=results.flatMap((r,i)=>r.status==='rejected'?[`${feeds[i][0]} sample unavailable`]:[])
  if(!roster.complete)issues.push('Roster coverage incomplete')
  return {season,fetchedAt:new Date().toISOString(),issues,players:ids.map(id=>({id,...Object.fromEntries(feeds.map(([key],i)=>{const result=results[i];return [key,result.status==='fulfilled'?result.value.data.find(p=>p.player.id===id)?.stats??{}:{}]}))})) as PaintScouting['players']}
}
export async function getPaintProfile(player: number, season: number) {
  const params = `season=${season}&season_type=regular&player_ids[]=${player}`
  const result = await Promise.allSettled([
    bdl<Average>(`/nba/v1/season_averages/shooting?${params}&type=by_zone`, 3600),
    bdl<Average>(`/nba/v1/season_averages/general?${params}&type=advanced`, 3600),
  ])
  return { shooting: result[0].status === 'fulfilled' ? result[0].value.data[0]?.stats ?? null : null, advanced: result[1].status === 'fulfilled' ? result[1].value.data[0]?.stats ?? null : null }
}
export async function getPaintBoard(game: PaintGame, mode: NbaOddsMode = 'pregame'): Promise<PaintBoard> {
  game = await getNbaOddsGame(game)
  const load = async () => {
    const cached = await nbaSharedCache(`board:v7:${game.id}:${nbaToday()}`, 60, 300, () => loadPaintBoard(game), 120)
    if (mode === 'pregame' && (cached.value.statsComplete !== true || cached.value.periodStatsComplete !== true || boardBaselineIncomplete(cached.value))) {
      const prior = await readNbaPregameResearch<PaintBoard>(game, 'board:v1')
      // Preserve a complete observation as a bundle, including its original
      // timestamp. Never combine a new roster with older averages or logs.
      if (prior && (prior.value.statsComplete === true && cached.value.statsComplete !== true || prior.value.periodStatsComplete === true && cached.value.periodStatsComplete !== true || !boardBaselineIncomplete(prior.value) && boardBaselineIncomplete(cached.value))) return { value: prior.value, observedAt: prior.observedAt }
    }
    return { value: { ...cached.value, fetchedAt: cached.fetchedAt, issues: [...cached.value.issues, ...(cached.stale ? ['Research refresh delayed'] : [])] }, observedAt: cached.fetchedAt }
  }
  if (mode === 'live') return refreshPaintBoardPrices({ ...(await load()).value, game }, mode)
  const snapshot = await nbaPregameResearch(game, 'board:v1', load)
  const board = { ...snapshot.value, game, historical: !nbaPregameOpen(game), fetchedAt: snapshot.observedAt, researchSnapshot: { observedAt: snapshot.observedAt, source: snapshot.source, frozen: snapshot.frozen } }
  // Preserve every archived roster member, average, full-game/quarter log and
  // coverage flag. Only phase-specific quotes attach after research is frozen.
  const priced = await refreshPaintBoardPrices(board, mode)
  if (snapshot.frozen || nbaPregameOpen(priced.game)) return priced
  // Quotes may finish after tip while another request saved a newer research
  // observation. Resolve the durable winner before returning a closed board.
  const final = await nbaPregameResearch(priced.game, 'board:v1', load)
  return refreshPaintBoardPrices({ ...final.value, game: priced.game, historical: true, fetchedAt: final.observedAt, researchSnapshot: { observedAt: final.observedAt, source: final.source, frozen: final.frozen } }, mode)
}
function boardBaselineIncomplete(board: PaintBoard) {
  return board.issues.some(issue => ['Roster coverage incomplete', 'Season averages unavailable', 'Prior-season averages unavailable'].includes(issue))
}
export async function getPaintPrices(game: PaintGame, mode: NbaOddsMode = 'pregame') {
  game = await getNbaOddsGame(game)
  const empty = { props: [] as PaintProp[], gameOdds: [] as PaintGameOdds[], firstBasket: [] as PaintProp[], observedAt: new Date().toISOString(), issues: [] as string[] }
  const frozen = async () => {
    const snapshot = await getNbaPhaseSnapshot(game, mode)
    return { props: snapshot.props, gameOdds: snapshot.gameOdds, firstBasket: snapshot.firstBasket, observedAt: Object.values(snapshot.capturedAt).filter((at): at is string => !!at).sort().at(-1) ?? empty.observedAt, issues: [] as string[] }
  }
  if (mode === 'pregame' && !nbaPregameOpen(game)) return frozen()
  if (mode === 'live' && !nbaLiveOpen(game)) return nbaGameFinal(game) ? frozen() : empty
  const cached = await nbaSharedCache(`phase-prices:v5:${mode}:${game.id}:${nbaGameStart(game)}`, 30, 0, async () => {
    // Phase-specific leases ensure thousands of members share one refresh.
    const issues: string[] = []
    const optional = async <T,>(label: string, promise: Promise<T>, fallback: T): Promise<T> => { try { return await promise } catch { issues.push(label); return fallback } }
    const [snapshot, gameOdds, firstBasket] = await Promise.all([
      getPaintPropSnapshot(game, mode, true),
      optional('Game lines unavailable', getPaintGameOdds(game.id, true), []),
      optional('First-basket prices unavailable', getNbaFirstOddsForMode(game, mode).then(result => result.rows.map(row => row.offer)), []),
    ])
    const now = Date.now()
    return { props: snapshot.props.filter(quote => quote.game_id === game.id && nbaQuoteInMode(quote, game, mode, now)), gameOdds: gameOdds.filter(quote => (quote.game_id == null || quote.game_id === game.id) && nbaQuoteInMode(quote, game, mode, now)), firstBasket: firstBasket.filter(quote => quote.game_id === game.id && nbaQuoteInMode(quote, game, mode, now)), observedAt: new Date(now).toISOString(), issues: [...issues, ...snapshot.issues] }
  }, 60)
  // Neither a response crossing tipoff nor an unexpired pregame cache can
  // replace the stored closing frame after the boundary.
  if (mode === 'pregame' && !nbaPregameOpen(game)) return frozen()
  const fresh = (quote: PaintProp) => !nbaSupplementalQuote(quote) || (Date.parse(quote.updated_at) <= Date.now() && Date.now() - Date.parse(quote.updated_at) <= 300_000)
  const current = cached.value.props.filter(fresh), firstBasket = cached.value.firstBasket.filter(fresh)
  return { ...cached.value, props: current, firstBasket, issues: current.length === cached.value.props.length && firstBasket.length === cached.value.firstBasket.length ? cached.value.issues : [...cached.value.issues, 'Some sportsbook prices unavailable'] }
}
export async function refreshPaintBoardPrices(board: PaintBoard, mode: NbaOddsMode = board.oddsMode ?? 'pregame'): Promise<PaintBoard> {
  const game = await getNbaOddsGame(board.game)
  const issues: string[] = []
  const optional = async <T,>(label: string, promise: Promise<T>, fallback: T): Promise<T> => { try { return await promise } catch { issues.push(label); return fallback } }
  const [prices, openings] = await Promise.all([
    optional('Sportsbook prices unavailable', getPaintPrices(game, mode), { props: [] as PaintProp[], gameOdds: [] as PaintGameOdds[], firstBasket: [] as PaintProp[], observedAt: new Date().toISOString(), issues: [] as string[] }),
    optional('Opening prices unavailable', getNbaQuoteOpenings(game.id, mode), []),
  ])
  // Research may survive an outage; quotes come only from their strict shared
  // TTL and never inherit the research cache's five-minute fallback.
  const quotes = nbaAttachOpenings(game.id, [...prices.props, ...prices.firstBasket], prices.gameOdds, openings)
  const priceIssues = new Set(['Sportsbook prices unavailable', 'Some sportsbook prices unavailable', 'Game lines unavailable', 'Opening prices unavailable', 'First-basket prices unavailable'])
  return { ...board, oddsMode: mode, game, gameOdds: quotes.gameOdds, players: board.players.map(player => ({ ...player, props: quotes.props.filter(prop => prop.player_id === player.id && prop.game_id === game.id && Number.isFinite(Number(prop.line_value))) })), issues: [...board.issues.filter(issue => !priceIssues.has(issue)), ...issues, ...prices.issues] }
}
async function loadPaintBoard(game: PaintGame): Promise<PaintBoard> {
  const deadline = Date.now() + 65_000
  const issues: string[] = []
  const historical = (game.date < nbaToday() || game.status_state === 'final' || game.status === 'Final' || game.status_state === 'in_progress' || game.period > 0 || !!game.datetime && Date.parse(game.datetime) <= Date.now())
  async function optional<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> { try { return await promise } catch (error) { console.error('[The Court]', label, { status: error instanceof PaintProviderError ? error.status : null }); issues.push(label); return fallback } }
  const teams = [game.visitor_team, game.home_team]
  const teamQuery = teams.map(t => `team_ids[]=${t.id}`).join('&')
  const [roster, injuries, images, directory, lineups] = await Promise.all([
    (game.date < nbaToday() || game.status_state === 'final' || game.status === 'Final') ? getPaintFinalStats(game.id).then(result => ({ complete: result.complete, rows: result.rows.filter(row => row.player.first_name && row.player.last_name).map(row => ({ ...row.player, team: row.team }) as PaintRoster) })) : pages<PaintRoster>(`/v1/players/active?${teamQuery}&per_page=100`, 3600, 2, deadline),
    optional('Injury report unavailable', pages<{ player: { id: number }; status: string; description: string; return_date?: string }>(`/v1/player_injuries?${teamQuery}&per_page=100`, 300, 2, deadline), { rows: [], complete: false }),
    Promise.all(teams.map(t => optional('Some player images unavailable', artwork(t.abbreviation), { headshots: new Map<string, string | null>(), logo: null }))),
    optional('Team directory unavailable', bdl<PaintTeam & { conference: string }>('/v1/teams?per_page=100',86400), { data: [] }),
    optional('Starting lineups unavailable', bdl<{ player: { id: number }; starter: boolean }>(`/v1/lineups?game_ids[]=${game.id}&per_page=100`, 120), { data: [] }),
  ])
  const quotes: { props: PaintProp[]; gameOdds: PaintGameOdds[] } = { props: [], gameOdds: [] }
  if (!roster.complete) issues.push('Roster coverage incomplete')
  const ids = roster.rows.map(p => p.id)
  const idsQuery = ids.map(id => `player_ids[]=${id}`).join('&')
  if (!ids.length) return { game, players: [], sampleSeason: game.season, historical, sampleEnd: game.date, fetchedAt: new Date().toISOString(), issues: [...issues, 'No roster returned'], statsComplete: false }
  const averages = await optional('Season averages unavailable', bdl<Average>(`/nba/v1/season_averages/general?${idsQuery}&season=${game.season}&season_type=regular&type=base&per_page=100`, 900), { data: [] })
  const sampleSeason = averages.data.some(a => (a.stats.gp ?? 0) > 0) ? game.season : game.season - 1
  const seasonAverages = sampleSeason === game.season ? averages : await optional('Prior-season averages unavailable', bdl<Average>(`/nba/v1/season_averages/general?${idsQuery}&season=${sampleSeason}&season_type=regular&type=base&per_page=100`, 3600), { data: [] })
  const end = new Date(`${game.date}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1)
  // No future results in any sample; previous season's regular-season logs stay separate.
  const sampleEnd = [end.toISOString().slice(0, 10), `${sampleSeason + 1}-07-01`].sort()[0]
  const sampleStart = new Date(`${sampleEnd}T12:00:00Z`); sampleStart.setUTCDate(sampleStart.getUTCDate() - 200)
  const [stats, teamStats, quarterStats] = await Promise.all([
    optional('Game-log data unavailable', pages<PaintStat>(`/v1/stats?${idsQuery}&seasons[]=${sampleSeason}&season_type=regular&start_date=${sampleStart.toISOString().slice(0, 10)}&end_date=${sampleEnd}&per_page=100`, 3600, 24, deadline), { rows: [], complete: false }),
    historical ? Promise.resolve({ data: [] }) : optional('Team ratings unavailable', bdl<{ team: PaintTeam; stats: Record<string, number | null> }>(`/nba/v1/team_season_averages/general?${teamQuery}&season=${sampleSeason}&season_type=regular&type=advanced&per_page=100`, 3600), { data: [] }),
    optional('First-quarter logs unavailable', pages<PaintStat>(`/v1/stats?${idsQuery}&seasons[]=${sampleSeason}&season_type=regular&start_date=${sampleStart.toISOString().slice(0, 10)}&end_date=${sampleEnd}&period=1&per_page=100`, 3600, 24, deadline), { rows: [], complete: false }),
  ])
  if (!stats.complete) issues.push('Game-log coverage incomplete; rates use returned games only')
  const needsBaseline = sampleSeason === game.season && game.date < `${game.season + 1}-01-01` && roster.rows.some(player => nbaSample(stats.rows.filter(row => row.player.id === player.id), 20).length < 20)
  const baseline = needsBaseline ? await optional('Prior-season game-log baseline unavailable', pages<PaintStat>(`/v1/stats?${idsQuery}&seasons[]=${sampleSeason - 1}&season_type=regular&start_date=${sampleSeason}-02-01&end_date=${sampleSeason}-07-01&per_page=100`, 3600, 24, deadline), { rows: [], complete: false }) : { rows: [] as PaintStat[], complete: true }
  if (!baseline.complete) issues.push('Prior-season game-log baseline incomplete')
  const quarterBaseline = needsBaseline ? await optional('Prior-season first-quarter baseline unavailable', pages<PaintStat>(`/v1/stats?${idsQuery}&seasons[]=${sampleSeason - 1}&season_type=regular&start_date=${sampleSeason}-02-01&end_date=${sampleSeason}-07-01&period=1&per_page=100`,3600,24,deadline),{ rows: [], complete: false }) : { rows: [] as PaintStat[], complete: true }
  let teamProfiles = teamStats.data, teamStatsSeason = sampleSeason
  if (!historical && Date.now() < deadline && sampleSeason === game.season && (teamProfiles.length < 2 || teamProfiles.some(row => (row.stats.gp ?? 0) < 5))) {
    const prior = await optional('Prior-season team profiles unavailable', bdl<{ team: PaintTeam; stats: Record<string, number | null> }>(`/nba/v1/team_season_averages/general?${teamQuery}&season=${sampleSeason - 1}&season_type=regular&type=advanced&per_page=100`, 3600), { data: [] })
    const verified = prior.data.filter(row => teams.some(team => team.id === row.team.id))
    if (new Set(verified.map(row => row.team.id)).size === 2) { teamProfiles = verified; teamStatsSeason = sampleSeason - 1 }
  }
  if (!injuries.complete) issues.push('Injury coverage incomplete')
  const avgMap = new Map<number, Record<string, number | null>>(seasonAverages.data.map(a => [a.player.id, { ...a.stats, turnover: a.stats.turnover ?? a.stats.tov ?? null }]))
  const players: PaintPlayer[] = roster.rows.map(player => {
    const valid = (row: PaintStat, season: number) => row.player.id === player.id && row.game.date.slice(0, 10) < game.date && (row.game.season == null || row.game.season === season) && row.game.postseason !== true && (row.game.status_state === 'final' || row.game.status === 'Final')
    const currentLogs = stats.rows.filter(row => valid(row, sampleSeason) && row.game.date.slice(0, 10) <= sampleEnd)
    const priorLogs = nbaSample(currentLogs, 20).length < 20 ? baseline.rows.filter(row => valid(row, sampleSeason - 1) && row.game.date.slice(0, 10) <= `${sampleSeason}-07-01`) : []
    const logs = nbaSample([...currentLogs, ...priorLogs], 40).map(nbaCompactStat)
    const currentQuarters = quarterStats.rows.filter(row => valid(row,sampleSeason) && row.game.date.slice(0,10)<=sampleEnd)
    const priorQuarters = nbaSample(currentQuarters,20).length<20 ? quarterBaseline.rows.filter(row=>valid(row,sampleSeason-1)) : []
    const periodLogs = nbaSample([...currentQuarters,...priorQuarters].map(row => ({ ...row, period: 1 })), 40).map(nbaCompactStat)
    const sampleAvg: Record<string, number | null> = {}
    for (const key of ['pts', 'reb', 'ast', 'fg3m', 'stl', 'blk', 'turnover', 'fga', 'fgm', 'fg3a', 'fta', 'ftm']) { const values = logs.map(s => (s as unknown as Record<string, number | null>)[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)); sampleAvg[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }
    for (const market of ['double_double','triple_double']) sampleAvg[market] = nbaAverage(logs, market)
    const mins = logs.map(s => nbaMinutes(s.min)).filter((v): v is number => v != null); sampleAvg.min = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null
    return { ...player, headshot: images[teams.findIndex(t => t.id === player.team.id)]?.headshots.get(nbaName(`${player.first_name} ${player.last_name}`)) ?? null,
      injury: historical ? null : injuries.rows.find(i => i.player.id === player.id) ?? null, average: historical ? sampleAvg : (avgMap.get(player.id)?.gp ?? 0) > 0 ? avgMap.get(player.id)! : sampleAvg,
      averageSeason: (avgMap.get(player.id)?.gp ?? 0) > 0 || !priorLogs.length ? sampleSeason : sampleSeason - 1,
      periodLogs, logs, props: quotes.props.filter(p => p.player_id === player.id && p.game_id === game.id && Number.isFinite(Number(p.line_value))) }
  })
  for (const player of players) for (const market of ['points_1q','rebounds_1q','assists_1q']) player.average[market] = nbaAverage(player.periodLogs ?? [], market)
  if (!quarterStats.complete || !quarterBaseline.complete) issues.push('First-quarter sample incomplete')
  const baselineSeasons = [...new Set(players.flatMap(player => player.logs.map(log => log.game.season ?? sampleSeason)))].sort()
  return { game, players, sampleSeason, baselineSeasons, historical, sampleEnd, fetchedAt: new Date().toISOString(), issues: [...new Set(issues)], statsComplete: stats.complete && baseline.complete, periodStatsComplete: quarterStats.complete && quarterBaseline.complete, teamStats: teamProfiles, teamStatsSeason, teams: directory.data.filter(team => ['East','West'].includes(team.conference)), gameOdds: quotes.gameOdds, starters: lineups.data.filter(p => p.starter).map(p => p.player.id) }
}
