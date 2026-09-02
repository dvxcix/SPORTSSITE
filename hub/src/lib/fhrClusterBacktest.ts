import { normName } from '@slipsurge/core/nameNorm'
import { asyncPool } from '@/lib/matrixMatch'
import { fetchOfficialHrOutcomes } from '@/lib/hrOutcomes'
import { fetchHistoricalGameBundles, type GameBundleSourceMode } from '@/lib/matrixBacktest'
import {
  buildHrGameIntelligence,
  type HrCandidateRead,
  type HrGameIntelligence,
} from '@/lib/hrGameIntelligence'

export type GradedHrCandidate = HrCandidateRead & {
  isFirstHr: boolean
  hitAnyHr: boolean
}

export type FhrClusterGameResult = {
  gameKey: string
  awayAbbr: string
  homeAbbr: string
  startsAt: string
  status: string
  lineupsConfirmed: boolean
  graded: boolean
  anytimeGraded: boolean
  fhrGraded: boolean
  gradeIssues: string[]
  noHr: { current: number | null; open: number | null; occurred: boolean; probabilityMove: number | null }
  actualFirstHr: { name: string; team: string } | null
  actualHrHitters: { name: string; team: string }[]
  clusterKind: 'exact' | 'near' | 'none'
  clusters: { priceLow: number; priceHigh: number; names: string[]; containsFirstHr: boolean }[]
  intelligence: Omit<HrGameIntelligence, 'candidates' | 'fhrReads' | 'companionReads'>
  fhrReads: GradedHrCandidate[]
  companionReads: GradedHrCandidate[]
  selected: GradedHrCandidate | null
  marketFavorite: GradedHrCandidate | null
  candidates: GradedHrCandidate[]
}

export type FhrClusterBacktestResult = {
  config: { nearOddsPoints: number; selector: string }
  dates: { date: string; games: FhrClusterGameResult[]; error?: string }[]
  aggregate: {
    gradedGames: number
    noHrGames: number
    gamesWithRead: number
    firstHrHits: number
    firstHrHitRate: number
    anytimeHits: number
    anytimeHitRate: number
    companionFlags: number
    companionHits: number
    companionHitRate: number
    shortlistFlags: number
    shortlistHits: number
    shortlistPrecision: number
    realHrHitters: number
    shortlistRecall: number
    clusterContainedFirstHr: number
    clusterCoverage: number
    marketFavoriteFirstHrHits: number
    marketFavoriteHitRate: number
    unitsRisked: number
    netUnits: number
    roi: number
  }
}

function americanProfit(price: number): number {
  return price > 0 ? price / 100 : 100 / Math.abs(price)
}

function makeClusters(players: GradedHrCandidate[], nearOddsPoints: number) {
  const exact = new Map<number, GradedHrCandidate[]>()
  for (const player of players) {
    const group = exact.get(player.fhr) ?? []
    group.push(player)
    exact.set(player.fhr, group)
  }
  const exactGroups = [...exact.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([price, group]) => ({ priceLow: price, priceHigh: price, players: group }))
  if (exactGroups.length) return { kind: 'exact' as const, groups: exactGroups }

  const sorted = [...players].sort((a, b) => a.fhr - b.fhr)
  const groups: { priceLow: number; priceHigh: number; players: GradedHrCandidate[] }[] = []
  let current: GradedHrCandidate[] = []
  for (const player of sorted) {
    if (!current.length || player.fhr - current[current.length - 1].fhr <= nearOddsPoints) current.push(player)
    else {
      if (current.length > 1) groups.push({ priceLow: current[0].fhr, priceHigh: current[current.length - 1].fhr, players: current })
      current = [player]
    }
  }
  if (current.length > 1) groups.push({ priceLow: current[0].fhr, priceHigh: current[current.length - 1].fhr, players: current })
  return { kind: groups.length ? 'near' as const : 'none' as const, groups }
}

function todayEt(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export async function runFhrClusterDate(
  date: string,
  nearOddsPoints = 100,
  sourceMode: GameBundleSourceMode | 'auto' = 'auto',
) {
  try {
    const resolvedMode: GameBundleSourceMode = sourceMode === 'auto'
      ? (date >= todayEt() ? 'live' : 'historical')
      : sourceMode
    const bundles = await fetchHistoricalGameBundles(date, { sourceMode: resolvedMode })
    const finalBundles = bundles.filter(bundle => bundle.game.abstractStatus === 'Final' || /final/i.test(bundle.game.status))
    const outcomes = await fetchOfficialHrOutcomes(finalBundles.map(bundle => ({
      gamePk: bundle.game.gamePk,
      homeAbbr: bundle.game.homeAbbr,
      awayAbbr: bundle.game.awayAbbr,
    })))

    const games = bundles.map(bundle => {
      const lineupsConfirmed = bundle.game.homeLineupConfirmed && bundle.game.awayLineupConfirmed
      const final = bundle.game.abstractStatus === 'Final' || /final/i.test(bundle.game.status)
      const outcome = final ? outcomes.get(bundle.game.gamePk) : null
      const anytimeGraded = outcome?.anytimeGraded ?? false
      const fhrGraded = outcome?.fhrGraded ?? false
      const graded = anytimeGraded
      const playerRefs = [
        ...bundle.game.awayLineup.map(player => ({ player, team: bundle.game.awayAbbr, source: bundle.awayBundle })),
        ...bundle.game.homeLineup.map(player => ({ player, team: bundle.game.homeAbbr, source: bundle.homeBundle })),
      ]
      const intelligence = buildHrGameIntelligence(
        playerRefs.flatMap(({ player, team, source }) => {
          const fieldBundle = source.get(normName(player.name))
          return fieldBundle ? [{ name: player.name, team, bundle: fieldBundle }] : []
        }),
        bundle.noHr,
        bundle.inputIssues,
      )
      const hrNames = new Set((outcome?.hitters ?? []).map(hitter => hitter.nameNorm))
      const firstName = fhrGraded ? outcome?.firstHr?.nameNorm ?? null : null
      const grade = (candidate: HrCandidateRead): GradedHrCandidate => ({
        ...candidate,
        hitAnyHr: anytimeGraded && hrNames.has(normName(candidate.name)),
        isFirstHr: fhrGraded && firstName === normName(candidate.name),
      })
      const candidates = intelligence.candidates.map(grade)
      const candidateByKey = new Map(candidates.map(candidate => [`${candidate.team}:${normName(candidate.name)}`, candidate]))
      const mapReads = (reads: HrCandidateRead[]) => reads.flatMap(read => {
        const candidate = candidateByKey.get(`${read.team}:${normName(read.name)}`)
        return candidate ? [candidate] : []
      })
      const fhrReads = lineupsConfirmed ? mapReads(intelligence.fhrReads) : []
      const companionReads = lineupsConfirmed ? mapReads(intelligence.companionReads) : []
      const clusters = makeClusters(candidates, nearOddsPoints)
      const marketFavorite = lineupsConfirmed
        ? [...candidates].sort((a, b) => a.fhr - b.fhr || a.name.localeCompare(b.name))[0] ?? null
        : null
      const actualHrHitters = outcome?.hitters.map(hitter => ({ name: hitter.name, team: hitter.team })) ?? []
      return {
        gameKey: bundle.gameKey,
        awayAbbr: bundle.game.awayAbbr,
        homeAbbr: bundle.game.homeAbbr,
        startsAt: bundle.game.gameDate,
        status: bundle.game.status,
        lineupsConfirmed,
        graded,
        anytimeGraded,
        fhrGraded,
        gradeIssues: outcome?.issues ?? (final ? ['Official HR outcome is unavailable.'] : []),
        noHr: { ...intelligence.noHr, occurred: anytimeGraded && (outcome?.totalHomeRuns ?? 0) === 0 },
        actualFirstHr: fhrGraded && outcome?.firstHr ? { name: outcome.firstHr.name, team: outcome.firstHr.team } : null,
        actualHrHitters,
        clusterKind: clusters.kind,
        clusters: clusters.groups.map(group => ({
          priceLow: group.priceLow,
          priceHigh: group.priceHigh,
          names: group.players.map(player => player.name),
          containsFirstHr: group.players.some(player => player.isFirstHr),
        })),
        intelligence: {
          audit: intelligence.audit,
          regime: intelligence.regime,
          regimeConfidence: intelligence.regimeConfidence,
          regimeReasons: intelligence.regimeReasons,
          noHr: intelligence.noHr,
          aggregate: intelligence.aggregate,
        },
        fhrReads,
        companionReads,
        selected: fhrReads.length === 1 ? fhrReads[0] : null,
        marketFavorite,
        candidates,
      } satisfies FhrClusterGameResult
    })
    return { date, games }
  } catch (error: unknown) {
    return { date, games: [] as FhrClusterGameResult[], error: error instanceof Error ? error.message : String(error) }
  }
}

export async function runFhrClusterBacktest(dates: string[], nearOddsPoints = 100): Promise<FhrClusterBacktestResult> {
  const datesResult = await asyncPool(4, dates, date => runFhrClusterDate(date, nearOddsPoints))
  const allGames = datesResult.flatMap(result => result.games).filter(game => game.lineupsConfirmed)
  const games = allGames.filter(game => game.anytimeGraded)
  const fhrGames = allGames.filter(game => game.fhrGraded)
  const gamesWithRead = games.filter(game => game.fhrReads.length > 0 || game.companionReads.length > 0)
  const fhrGamesWithRead = fhrGames.filter(game => game.fhrReads.length > 0)
  const firstHrHits = fhrGamesWithRead.filter(game => game.fhrReads.some(read => read.isFirstHr)).length
  const anytimeHits = gamesWithRead.filter(game => [...game.fhrReads, ...game.companionReads].some(read => read.hitAnyHr)).length
  const companionFlags = games.reduce((sum, game) => sum + game.companionReads.length, 0)
  const companionHits = games.reduce((sum, game) => sum + game.companionReads.filter(read => read.hitAnyHr).length, 0)
  const shortlistByGame = games.map(game => {
    const map = new Map<string, GradedHrCandidate>()
    for (const read of [...game.fhrReads, ...game.companionReads]) map.set(`${read.team}:${normName(read.name)}`, read)
    return [...map.values()]
  })
  const shortlistFlags = shortlistByGame.reduce((sum, reads) => sum + reads.length, 0)
  const shortlistHits = shortlistByGame.reduce((sum, reads) => sum + reads.filter(read => read.hitAnyHr).length, 0)
  const realHrHitters = games.reduce((sum, game) => sum + game.actualHrHitters.length, 0)
  const marketFavoriteFirstHrHits = fhrGames.filter(game => game.marketFavorite?.isFirstHr).length
  const clusterContainedFirstHr = fhrGamesWithRead.filter(game => game.clusters.some(cluster => cluster.containsFirstHr)).length
  const fhrFlags = fhrGames.reduce((sum, game) => sum + game.fhrReads.length, 0)
  const netUnits = fhrGames.reduce((sum, game) => sum + game.fhrReads.reduce(
    (gameSum, read) => gameSum + (read.isFirstHr ? americanProfit(read.fhr) : -1),
    0,
  ), 0)
  return {
    config: {
      nearOddsPoints,
      selector: 'complete 18-player audit + frozen pregame inputs + underlying pitch/contact support + market structure + separated top-tier publication; candidate count is never forced',
    },
    dates: datesResult,
    aggregate: {
      gradedGames: games.length,
      noHrGames: games.filter(game => game.noHr.occurred).length,
      gamesWithRead: gamesWithRead.length,
      firstHrHits,
      firstHrHitRate: fhrGamesWithRead.length ? firstHrHits / fhrGamesWithRead.length : 0,
      anytimeHits,
      anytimeHitRate: gamesWithRead.length ? anytimeHits / gamesWithRead.length : 0,
      companionFlags,
      companionHits,
      companionHitRate: companionFlags ? companionHits / companionFlags : 0,
      shortlistFlags,
      shortlistHits,
      shortlistPrecision: shortlistFlags ? shortlistHits / shortlistFlags : 0,
      realHrHitters,
      shortlistRecall: realHrHitters ? shortlistHits / realHrHitters : 0,
      clusterContainedFirstHr,
      clusterCoverage: fhrGamesWithRead.length ? clusterContainedFirstHr / fhrGamesWithRead.length : 0,
      marketFavoriteFirstHrHits,
      marketFavoriteHitRate: fhrGames.length ? marketFavoriteFirstHrHits / fhrGames.length : 0,
      unitsRisked: fhrFlags,
      netUnits,
      roi: fhrFlags ? netUnits / fhrFlags : 0,
    },
  }
}
