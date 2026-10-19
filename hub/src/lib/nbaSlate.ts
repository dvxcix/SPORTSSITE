import { nbaMarketLogs, nbaAverage, nbaHitRate, nbaReference, nbaSample, type PaintBoard, type PaintMarket, type PaintPlayer } from './nbaPaint'
import { nbaFormGap, nbaMarketRanks } from './nbaMarketMetrics'
import { nbaValidatedEstimate, type NbaModelReport } from './nbaModel'
import { nbaGamePace, nbaSlipSurgeScore } from './nbaIntelligence'
export type NbaPlayerIdentity = Pick<PaintPlayer, 'id' | 'first_name' | 'last_name' | 'position' | 'team' | 'headshot'>
export function nbaSlateRows(boards: PaintBoard[], market: PaintMarket, book: string, side: 'over' | 'under', complete: boolean, reports: NbaModelReport[] = []) {
  const prepared = boards.map(board => ({ ...board, players: board.players.map(player => ({ ...player, props: player.props.filter(offer => offer.game_id === board.game.id && offer.player_id === player.id), logs: player.logs.filter(log => log.game.date.slice(0, 10) < board.game.date) })) }))
  const players = prepared.flatMap(board => board.players), ranks = nbaMarketRanks(players, market, book)
  return prepared.flatMap(board => board.players.flatMap(player => {
    const offer = nbaReference(player.props, market, book, side)
    if (!offer) return []
    const logs = nbaSample(nbaMarketLogs(player, market).filter(log => log.game.date.slice(0, 10) < board.game.date), 10), average = nbaAverage(logs, market)
    const signal = nbaSlipSurgeScore(player, market, board.game.date, null, nbaGamePace(board)), hit = nbaHitRate(logs, market, Number(offer.line_value), side, offer.market.type === 'milestone')
    const report = reports.find(report=>report.market===market&&report.validationThrough<board.game.date), estimate = nbaValidatedEstimate(nbaMarketLogs(player,market),market,board.game.date,report)
    const identity: NbaPlayerIdentity = { id: player.id, first_name: player.first_name, last_name: player.last_name, position: player.position, team: player.team, headshot: player.headshot }
    return [{ player: identity, game: board.game, market, offer, estimate, modelError: estimate==null?null:report?.criterion==='brier'?report.validationBrier:report?.validationMae, modelMetric: report?.criterion??'mae', score: signal.score, coverage: signal.coverage, mm: complete ? ranks.get(player.id)?.mm ?? null : null, average, hit, gap: nbaFormGap(average, offer, side), fetchedAt: board.fetchedAt, issues: board.issues }]
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.mm ?? 0) - (a.mm ?? 0))
}
