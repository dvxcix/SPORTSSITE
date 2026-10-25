import 'server-only'
import { unstable_cache } from 'next/cache'
import { nflPregameResearch, readNflPregameResearch, saveNflPregameResearch, nflPregameOpen, NflPregameResearchUnavailable } from './nflPregameResearchData'
import type { SidelineGame } from '@/app/the-sideline/types'
import { americanImpliedProbability } from '@/lib/nflMarketMath'
import { contextualNflScore } from '@/lib/nflContextScore'
import { nflPrimaryMarket } from '@/lib/nflPrimaryMarket'
import { nflAvailability } from '@/lib/nflAvailability'
import { nflWatchlistSelection } from '@/lib/nflWatchlist'
import { normalizeNflPlayerName } from '@/lib/nflPlayerName'
import { defaultNflSample, nflSampleReference, type NflSample } from '@/lib/nflSample'
import {
  NFL_SLATE_EDGE_MARKETS,
  type NflSlateEdgeEntry,
  type NflSlateEdgeMarket,
  type NflSlateEdgeMarketKey,
  type NflSlateEdgePayload,
} from '@/lib/nflSlateEdge'
import { getCachedSidelineBoardLens, getCachedSidelineCheatsheetLens, getSidelineGames, getSidelineOddsBundle } from '@/app/the-sideline/data'
import type { NflMarketOffer, NflOddsPlayer } from '@/lib/nflOddsTypes'

const normalizedTeam = (value: string) => value.trim().toUpperCase()
const currentOdds = (offer: NflMarketOffer | null) => offer
  ? offer.type === 'milestone' ? offer.current.odds ?? null : offer.current.over ?? null
  : null
const openingOdds = (offer: NflMarketOffer | null) => offer?.opening
  ? offer.type === 'milestone' ? offer.opening.odds ?? null : offer.opening.over ?? null
  : null

function primaryOffer(player: NflOddsPlayer, propType: NflSlateEdgeMarketKey) {
  const market = nflPrimaryMarket(player, propType, 'fanduel') ?? nflPrimaryMarket(player, propType)
  if (!market) return { market: null, offer: null }
  const offer = market.offers.find(item => normalizeNflPlayerName(item.vendor) === 'fanduel')
    ?? market.offers.find(item => currentOdds(item) != null)
    ?? null
  return { market, offer }
}

function marketSnapshot(player: NflOddsPlayer, propType: NflSlateEdgeMarketKey, game: { id: string; gameday: string }): NflSlateEdgeMarket {
  const { market, offer } = primaryOffer(player, propType)
  const line = offer?.line ?? market?.line ?? null
  const comparable = market?.offers.filter(item => item.type === 'milestone' || item.line === line) ?? []
  const prices = comparable.flatMap(item => {
    const value = currentOdds(item)
    return value == null ? [] : [value]
  })
  const counts = (player.publicPicks ?? []).filter(item => item.propType === propType).map(item => item.picks)
  return {
    selection: market && offer && currentOdds(offer) != null ? nflWatchlistSelection(player, market, offer, 'over', game) : null,
    label: market?.label ?? NFL_SLATE_EDGE_MARKETS.find(item => item.key === propType)?.label ?? propType,
    line,
    openingLine: offer?.openingLine ?? null,
    odds: currentOdds(offer),
    openingOdds: openingOdds(offer),
    vendor: offer?.vendor ?? null,
    picks: counts.length ? Math.max(...counts) : null,
    bookGap: prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : null,
    books: comparable.filter(item => currentOdds(item) != null).map(item => item.vendor),
  }
}

function marketExpectation(market: NflSlateEdgeMarket, propType: NflSlateEdgeMarketKey) {
  const probability = americanImpliedProbability(market.odds)
  if (probability == null) return null
  if (propType.includes('td')) return probability
  return market.line == null
    ? probability
    : market.line + (probability - 0.5) * Math.max(Math.abs(market.line), 1) * 0.35
}


type GameEntries = { complete: true; entries: NflSlateEdgeEntry[] }
export type NflSlatePool = { complete: true; date: string; gameIds: string[]; entries: NflSlateEdgeEntry[] }
async function gameEntries(game: SidelineGame, sample: NflSample) {
  return nflPregameResearch<GameEntries>(game, `slate-entries:${sample}`, () => loadGameEntries(game, sample))
}
const loadGameEntries = unstable_cache(async (game: SidelineGame, sample: NflSample) => {
    const bundle = await getSidelineOddsBundle(game)
    const roster = bundle.odds.players.map(player => ({
      id: player.gsisId ?? `bdl-${player.id}`,
      bdlId: player.id,
      teamId: player.teamId ?? null,
      team: player.team,
      name: player.name,
      position: player.position,
    }))
    const lens = await getCachedSidelineBoardLens(game, roster, sample)
    if (bundle.odds.status !== 'ready' || lens.status !== 'calculated') throw new NflPregameResearchUnavailable()
    const windowData = lens.windows.season
    const trackedById = new Map(windowData.players.map(player => [player.id, player]))
    const trackedByName = new Map(windowData.players.map(player => [normalizeNflPlayerName(player.name), player]))
    const profiles = new Map(windowData.teams.map(item => [normalizedTeam(item.team.abbr), item]))
    const gameLine = bundle.odds.gameLines.find(item => normalizeNflPlayerName(item.vendor) === 'fanduel') ?? bundle.odds.gameLines[0]
    const teams = new Set([normalizedTeam(game.away.abbr), normalizedTeam(game.home.abbr)])

    const entries: NflSlateEdgeEntry[] = bundle.odds.players
      .filter(player => teams.has(normalizedTeam(player.team)) && nflAvailability(player, game.gameday).eligible)
      .map(player => {
        const tracked = (player.gsisId ? trackedById.get(player.gsisId) : null)
          ?? trackedByName.get(normalizeNflPlayerName(player.name))
          ?? null
        const team = normalizedTeam(player.team)
        const teamProfile = profiles.get(team) ?? null
        const opponentProfile = profiles.get(team === normalizedTeam(game.away.abbr) ? normalizedTeam(game.home.abbr) : normalizedTeam(game.away.abbr)) ?? null
        const markets = Object.fromEntries(NFL_SLATE_EDGE_MARKETS.map(item => [item.key, marketSnapshot(player, item.key, { id: game.id, gameday: game.gameday })])) as Record<NflSlateEdgeMarketKey, NflSlateEdgeMarket>
        const teamMoneyline = team === normalizedTeam(game.home.abbr) ? gameLine?.moneylineHome : gameLine?.moneylineAway
        const score = Object.fromEntries(NFL_SLATE_EDGE_MARKETS.map(item => [
          item.key,
          tracked
            ? contextualNflScore({ ...tracked, teamProfile, opponentProfile }, item.key, americanImpliedProbability(teamMoneyline ?? null), gameLine?.total ?? null).score
            : null,
        ])) as Record<NflSlateEdgeMarketKey, number | null>
        const teamInfo = team === normalizedTeam(game.away.abbr) ? game.away : game.home
        const roleShare = tracked
          ? ['RB', 'FB'].includes(player.position) ? tracked.carryShare : player.position === 'QB' ? 0 : tracked.targetShare
          : null
        return {
          id: player.gsisId ?? `bdl-${player.id}`,
          gameId: game.id,
          gameLabel: `${game.away.abbr} at ${game.home.abbr}`,
          awayAbbr: game.away.abbr,
          awayLogo: game.away.logo,
          homeAbbr: game.home.abbr,
          homeLogo: game.home.logo,
          team,
          teamLogo: teamInfo.logo,
          name: player.name,
          position: player.position,
          headshot: player.headshot ?? tracked?.headshot ?? null,
          games: tracked?.games ?? 0,
          score,
          mm: Object.fromEntries(NFL_SLATE_EDGE_MARKETS.map(item => [item.key, null])) as Record<NflSlateEdgeMarketKey, number | null>,
          markets,
          volume: tracked?.volume ?? null,
          redZone: tracked?.redZone ?? null,
          breakaway: tracked?.breakaway ?? null,
          evidence: tracked?.evidence ?? null,
          roleShare,
          redZoneLooks: tracked?.redZoneLooks ?? null,
          explosivePlays: tracked?.explosivePlays ?? null,
          dvp: tracked?.dvp ?? {},
        }
      })

    return { value: { complete: true as const, entries }, observedAt: new Date().toISOString() }
}, ['nfl-slate-entries-v1'], { revalidate: 30, tags: ['sideline:nfl-odds', 'sideline:nfl-picks', 'sideline:nfl-data'] })
export function rankNflSlateEntries(entries: NflSlateEdgeEntry[]) {
  for (const market of NFL_SLATE_EDGE_MARKETS) {
    const performance = entries.filter(entry => entry.score[market.key] != null)
      .sort((a, b) => (b.score[market.key] ?? -1) - (a.score[market.key] ?? -1))
    const sportsbook = entries
      .map(entry => ({ entry, expectation: marketExpectation(entry.markets[market.key], market.key) }))
      .filter((item): item is { entry: NflSlateEdgeEntry; expectation: number } => item.expectation != null)
      .sort((a, b) => b.expectation - a.expectation)
    const performanceRank = new Map(performance.map((entry, index) => [entry.id + entry.gameId, index + 1]))
    const sportsbookRank = new Map(sportsbook.map((item, index) => [item.entry.id + item.entry.gameId, index + 1]))
    entries.forEach(entry => {
      const key = entry.id + entry.gameId
      const model = performanceRank.get(key)
      const book = sportsbookRank.get(key)
      entry.mm[market.key] = model != null && book != null ? book - model : null
    })
  }


  return entries
}
function withoutRanks(entries: NflSlateEdgeEntry[]) {
  return entries.map(entry => ({ ...entry, mm: Object.fromEntries(NFL_SLATE_EDGE_MARKETS.map(market => [market.key, null])) as NflSlateEdgeEntry['mm'] }))
}
export async function getNflSlatePayload(games: SidelineGame[], date: string, explicitSample: NflSample | null, options: { archiveOnly?: boolean } = {}): Promise<NflSlateEdgePayload> {
  const sampleFor = (game: SidelineGame) => explicitSample ?? defaultNflSample(game)
  const samples = [...new Set(games.map(sampleFor))]
  const resource = `slate-pool:${date}:${samples.length === 1 ? samples[0] : 'auto'}`
  const closed = new Set(games.filter(game => !nflPregameOpen(game)).map(game => game.id))
  const load = async (game: SidelineGame) => {
    try { return { game, sample: sampleFor(game), archived: options.archiveOnly
      ? await readNflPregameResearch<GameEntries>(game, `slate-entries:${sampleFor(game)}`)
      : await gameEntries(game, sampleFor(game)) } }
    catch { return { game, sample: sampleFor(game), archived: null } }
  }
  const results = new Map((await Promise.all(games.map(load))).map(result => [result.game.id, result]))
  // Re-resolve peers that closed during loading before saving a later anchor.
  for (let pass = 0; pass < games.length; pass++) {
    const crossed = games.filter(game => !closed.has(game.id) && !nflPregameOpen(game))
    if (!crossed.length) break
    await Promise.all(crossed.map(async game => { closed.add(game.id); results.set(game.id, await load(game)) }))
  }
  const entries = rankNflSlateEntries([...results.values()].flatMap(result => result.archived?.value.entries ?? []))
  const complete = games.length > 0 && games.length <= 24 && new Set(games.map(game => game.id)).size === games.length
    && [...results.values()].every(result => result.archived?.value.complete === true)
  const observedAt = new Date().toISOString()
  const pool: NflSlatePool = { complete: true, date, gameIds: games.map(game => game.id), entries }
  const unavailableGames: string[] = [], snapshots: Record<string, string> = {}
  const resolve = async (game: SidelineGame, capture: boolean) => {
    let frozen = null
    try {
      frozen = await readNflPregameResearch<NflSlatePool>(game, resource)
      if (capture && complete && nflPregameOpen(game) && JSON.stringify(frozen?.value) !== JSON.stringify(pool)) {
        frozen = await saveNflPregameResearch(game, resource, { value: pool, observedAt })
      }
    }
    catch { /* A missing pool is explicit, never a partial rank. */ }
    if (frozen?.value.complete && frozen.value.date === date && frozen.value.gameIds.includes(game.id)) {
      snapshots[game.id] = frozen.observedAt
      const index = unavailableGames.indexOf(game.id); if (index >= 0) unavailableGames.splice(index, 1)
      return frozen.value.entries.filter(entry => entry.gameId === game.id)
    }
    if (!unavailableGames.includes(game.id)) unavailableGames.push(game.id)
    return withoutRanks(results.get(game.id)?.archived?.value.entries ?? [])
  }
  const resolvedClosed = new Set(games.filter(game => !nflPregameOpen(game)).map(game => game.id))
  const final = new Map(await Promise.all(games.map(async game => [game.id, await resolve(game, true)] as const)))
  // A slow peer's save must not let an earlier open response survive kickoff.
  for (let pass = 0; pass < games.length; pass++) {
    const crossed = games.filter(game => !resolvedClosed.has(game.id) && !nflPregameOpen(game))
    if (!crossed.length) break
    await Promise.all(crossed.map(async game => { resolvedClosed.add(game.id); results.set(game.id, await load(game)); final.set(game.id, await resolve(game, false)) }))
  }
  const sampleLabels = new Set(games.map(game => nflSampleReference(game.season, sampleFor(game)).label))
  return { date, sampleLabel: [...sampleLabels].join(' / '),
    games: games.map(game => ({ id: game.id, label: `${game.away.abbr} at ${game.home.abbr}`, awayAbbr: game.away.abbr, awayLogo: game.away.logo, homeAbbr: game.home.abbr, homeLogo: game.home.logo })),
    entries: [...final.values()].flat(), unavailableGames, snapshots }
}

/** Existing scheduled odds pass warms one least-recently observed matchup.
 * The pool-only pass never starts additional providers or rebuilds old stats. */
export async function warmNflPregameResearch(date: string, deadline: number) {
  if (Date.now() + 45_000 >= deadline) return { status: 'deferred' }
  const { games } = await getSidelineGames(date)
  const open = games.filter(nflPregameOpen)
  if (!open.length) return { status: 'closed' }
  const ages = await Promise.all(open.map(async game => ({ game, prior: await readNflPregameResearch<GameEntries>(game, `slate-entries:${defaultNflSample(game)}`) })))
  const candidate = ages.sort((a, b) => Date.parse(a.prior?.observedAt ?? '1970-01-01') - Date.parse(b.prior?.observedAt ?? '1970-01-01') || a.game.id.localeCompare(b.game.id))[0].game
  const sample = defaultNflSample(candidate)
  await gameEntries(candidate, sample)
  if (Date.now() + 30_000 < deadline) await getCachedSidelineCheatsheetLens(candidate, sample)
  if (Date.now() + 15_000 < deadline) {
    await getNflSlatePayload(games, date, null, { archiveOnly: true })
  }
  return { status: 'captured', gameId: candidate.id }
}
