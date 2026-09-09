export type NflSample = 'previous' | 'preseason' | 'regular'

export function parseNflSample(value: unknown): NflSample {
  return value === 'preseason' || value === 'regular' ? value : 'previous'
}

export function nflSampleReference(gameSeason: number, sample: NflSample) {
  return {
    season: sample === 'previous' ? gameSeason - 1 : gameSeason,
    phase: sample === 'preseason' ? 'PRE' as const : 'REG' as const,
    bdlPhase: sample === 'preseason' ? 1 as const : 2 as const,
    label: sample === 'previous' ? `${gameSeason - 1} regular season` : sample === 'preseason' ? `${gameSeason} preseason` : `${gameSeason} regular season`,
  }
}
