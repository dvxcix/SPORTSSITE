export type NflSample = 'previous' | 'preseason' | 'regular'

export function parseNflSample(value: unknown): NflSample {
  return value === 'preseason' || value === 'regular' ? value : 'previous'
}

/**
 * Early-season NFL boards must not silently present a one- or two-game
 * current sample as though it were a stable season reference. Members may
 * explicitly inspect that sample, but the product defaults to the complete
 * prior regular season until Week 4.
 */
export function defaultNflSample(game: { gameType: string; week: number }): NflSample {
  if (game.gameType === 'PRE') return 'preseason'
  return game.gameType === 'REG' && game.week > 3 ? 'regular' : 'previous'
}

export function nflSampleReference(gameSeason: number, sample: NflSample) {
  return {
    season: sample === 'previous' ? gameSeason - 1 : gameSeason,
    phase: sample === 'preseason' ? 'PRE' as const : 'REG' as const,
    bdlPhase: sample === 'preseason' ? 1 as const : 2 as const,
    label: sample === 'previous' ? `${gameSeason - 1} regular season` : sample === 'preseason' ? `${gameSeason} preseason` : `${gameSeason} regular season`,
  }
}
