import { nbaMarketLogs, nbaAverage, nbaHitRate, nbaReference, nbaSample, type PaintBoard, type PaintMarket, type PaintPlayer } from './nbaPaint'
import { nbaFormGap, nbaMarketRanks } from './nbaMarketMetrics'
import { nbaValidatedEstimate, type NbaModelReport } from './nbaModel'
import { nbaGamePace, nbaPosition, nbaSlipSurgeScore, type NbaDvp } from './nbaIntelligence'
import type { NbaMarketContext,NbaMarketSupportView } from './nbaMarketSignal'
import type { NbaSlateHeat } from './nbaSlateHeat'
export type NbaPlayerIdentity = Pick<PaintPlayer, 'id' | 'first_name' | 'last_name' | 'position' | 'team' | 'headshot'>
export type NbaSlateViewRow=Omit<ReturnType<typeof nbaSlateRows>[number],'baseScore'|'coverage'|'modelError'|'modelMetric'|'signalOffers'|'marketSupport'>&{marketSupport:NbaMarketSupportView;marketSignals:NbaMarketSupportView;researchObservedAt?:string;frozenHeat?:NbaSlateHeat}
export function nbaSlateRows(boards: PaintBoard[], market: PaintMarket, book: string, side: 'over' | 'under', complete: boolean, reports: NbaModelReport[] = [], defense: {gameId:number;profiles:NbaDvp[]}[] = [], markets: NbaMarketContext[] = [], frozen?: { ranks: Map<string, number>; reports?: { gameId: number; reports: NbaModelReport[] }[] }) {
  const prepared = boards.map(board => ({ ...board, players: board.players.map(player => ({ ...player, props: player.props.filter(offer => offer.game_id === board.game.id && offer.player_id === player.id), logs: player.logs.filter(log => log.game.date.slice(0, 10) < board.game.date), periodLogs: player.periodLogs?.filter(log => log.game.date.slice(0, 10) < board.game.date) })) }))
  const players = prepared.flatMap(board => board.players), ranks = nbaMarketRanks(players, market, book)
  return prepared.flatMap(board => board.players.flatMap(player => {
    const offer = nbaReference(player.props, market, book, side)
    if (!offer) return []
    const logs = nbaSample(nbaMarketLogs(player, market).filter(log => log.game.date.slice(0, 10) < board.game.date), 10), average = nbaAverage(logs, market)
    const opponent=player.team.id===board.game.home_team.id?board.game.visitor_team.id:board.game.home_team.id,matchup=defense.find(context=>context.gameId===board.game.id)?.profiles.find(profile=>profile.teamId===opponent&&profile.position===nbaPosition(player.position)&&profile.market===market)
    const signal = nbaSlipSurgeScore(player, market, board.game.date, matchup, nbaGamePace(board), {offer,side,context:markets.find(context=>context.gameId===board.game.id)??null}), hit = nbaHitRate(logs, market, Number(offer.line_value), side, offer.market.type === 'milestone')
    const eligibleReports = frozen?.reports?.find(item => item.gameId === board.game.id)?.reports ?? reports
    const report = eligibleReports.find(report=>report.market===market&&report.validationThrough<board.game.date), estimate = nbaValidatedEstimate(nbaMarketLogs(player,market),market,board.game.date,report)
    const identity: NbaPlayerIdentity = { id: player.id, first_name: player.first_name, last_name: player.last_name, position: player.position, team: player.team, headshot: player.headshot }
    return [{ player: identity, game: board.game, market, offer, signalOffers:player.props, estimate, modelError: estimate==null?null:report?.criterion==='brier'?report.validationBrier:report?.validationMae, modelMetric: report?.criterion??'mae', score: signal.score, baseScore:signal.baseScore,marketSupport:signal.marketSupport,coverage: signal.coverage, mm: frozen ? frozen.ranks.get(`${board.game.id}:${player.id}`) ?? null : complete ? ranks.get(player.id)?.mm ?? null : null, average, hit, gap: nbaFormGap(average, offer, side), fetchedAt: board.fetchedAt, issues: board.issues }]
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.mm ?? 0) - (a.mm ?? 0))
}
