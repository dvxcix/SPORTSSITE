import { nbaAverage, nbaSample, nbaValue, type PaintMarket, type PaintStat } from './nbaPaint'
export type NbaModelReport = { trainingFrom?: string; sourceCoverage?: {season:number;appearances:number;games:number;first_date:string;last_date:string}[]; split?: string; criterion?: 'mae'|'brier'; validationBrier?: number|null; baselineBrier?: number|null; ready: boolean; version: string; market: PaintMarket; method: 'last10' | 'blend'; recentWeight: number | null; modelKey: string; trainingSeasons: number[]; trainingGames: number; trainingPlayers: number; trainingMae: number; trainedThrough: string; validationSeason: number; validationGames: number; validationPlayers: number; validationMae: number; validationRmse: number; validationBias: number; baselineMae: number; validationFrom: string; validationThrough: string }
export function nbaValidatedEstimate(logs: PaintStat[], market: PaintMarket, before: string, report: NbaModelReport | undefined) {
  if (!report?.ready || report.trainingGames < 1000 || report.validationGames < 200 || report.market !== market || report.version !== 'nba-rolling-v1' || report.trainedThrough >= before || report.validationThrough >= before) return null
  const sample = nbaSample(logs.filter(log => log.game.date.slice(0, 10) < before && (log.game.status_state === 'final' || log.game.status === 'Final') && nbaValue(log, market) != null), 20)
  if (sample.length < 10) return null
  if (report.method === 'last10') return nbaAverage(sample.slice(0, 10), market)
  if (report.method !== 'blend' || report.recentWeight == null || !Number.isFinite(report.recentWeight) || report.recentWeight < 0 || report.recentWeight > 1) return null
  const recent = nbaAverage(sample.slice(0, 5), market), prior = nbaAverage(sample.slice(5), market)
  return recent == null || prior == null ? null : recent * report.recentWeight + prior * (1 - report.recentWeight)
}

/** Redact, rather than recalculate, a legacy model value if any input actually
 * used by that exact model came from a different or unproven season. This
 * preserves the original archived inputs and avoids silently changing a frozen
 * estimate by dropping part of its old sample. */
export function nbaSelectedSeasonEstimate(logs: PaintStat[], market: PaintMarket, before: string, season: number, report: NbaModelReport | undefined) {
  if (!report || !Number.isSafeInteger(season) || season < 2000 || season > 2200) return null
  const beforeParsed = Date.parse(`${before}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before) || !Number.isFinite(beforeParsed)
    || new Date(beforeParsed).toISOString().slice(0, 10) !== before
    || before < `${season}-07-01` || before >= `${season + 1}-07-01`) return null
  const sample = nbaSample(logs.filter(log => log.game.date.slice(0, 10) < before
    && (log.game.status_state === 'final' || log.game.status === 'Final') && nbaValue(log, market) != null), 20)
  const used = report.method === 'last10' ? sample.slice(0, 10) : sample
  if (used.some(log => {
    const date = log.game.date.slice(0, 10), parsed = Date.parse(`${date}T00:00:00Z`)
    return log.game.season !== season
      || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date
      || log.game.date !== date && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(log.game.date) || !Number.isFinite(Date.parse(log.game.date)))
      || date < `${season}-07-01` || date >= `${season + 1}-07-01`
  })) return null
  return nbaValidatedEstimate(logs, market, before, report)
}
