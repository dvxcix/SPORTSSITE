import { nbaAverage, nbaSample, nbaValue, type PaintMarket, type PaintStat } from './nbaPaint'
export type NbaModelReport = { ready: boolean; version: string; market: PaintMarket; method: 'last10' | 'blend'; recentWeight: number | null; modelKey: string; trainingSeasons: number[]; trainingGames: number; trainingPlayers: number; trainingMae: number; trainedThrough: string; validationSeason: number; validationGames: number; validationPlayers: number; validationMae: number; validationRmse: number; validationBias: number; baselineMae: number; validationFrom: string; validationThrough: string }
export function nbaValidatedEstimate(logs: PaintStat[], market: PaintMarket, before: string, report: NbaModelReport | undefined) {
  if (!report?.ready || report.trainingGames < 1000 || report.validationGames < 200 || report.market !== market || report.version !== 'nba-rolling-v1' || report.trainedThrough >= before || report.validationThrough >= before) return null
  const sample = nbaSample(logs.filter(log => log.game.date.slice(0, 10) < before && (log.game.status_state === 'final' || log.game.status === 'Final') && nbaValue(log, market) != null), 20)
  if (sample.length < 10) return null
  if (report.method === 'last10') return nbaAverage(sample.slice(0, 10), market)
  if (report.method !== 'blend' || report.recentWeight == null || !Number.isFinite(report.recentWeight) || report.recentWeight < 0 || report.recentWeight > 1) return null
  const recent = nbaAverage(sample.slice(0, 5), market), prior = nbaAverage(sample.slice(5), market)
  return recent == null || prior == null ? null : recent * report.recentWeight + prior * (1 - report.recentWeight)
}
