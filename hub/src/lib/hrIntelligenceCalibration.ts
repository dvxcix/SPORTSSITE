import type { HrIntelBoardProfile, HrIntelQualifiedLane } from './hrIntelligence'

export type HrIntelValidatedRule = {
  id: string
  target: 'fhr' | 'anytime'
  boardProfiles: HrIntelBoardProfile[]
  lane: HrIntelQualifiedLane
  maxCandidates: number
  support: {
    trainGames: number
    calibrationGames: number
    holdoutGames: number
    trainPrecision: number
    calibrationPrecision: number
    holdoutPrecision: number
  }
}

// This registry is intentionally empty. The 2026-07-17 through 2026-08-11
// walk-forward audit found no rule that met distinct-game support and precision
// requirements in discovery, calibration, and untouched holdout. Diagnostic
// lanes remain visible, but adding a rule here requires a new dated audit.
export const HR_INTELLIGENCE_CALIBRATION = {
  version: 'walk-forward-publication-v4',
  auditedThrough: '2026-08-11',
  splits: {
    discovery: { start: '2026-07-17', end: '2026-07-31', completeGames: 207 },
    calibration: { start: '2026-08-01', end: '2026-08-07', completeGames: 94 },
    holdout: { start: '2026-08-08', end: '2026-08-11', completeGames: 46 },
  },
  minimumSupport: {
    fhr: { discoveryGames: 15, calibrationGames: 8, precision: 0.55 },
    anytime: { discoveryGames: 12, calibrationGames: 6, precision: 0.65 },
  },
  qualifiedRules: [] as HrIntelValidatedRule[],
} as const
