import type { TodayGame } from '@slipsurge/core/mlbSchedule'
import { createAdminClient } from '@/lib/supabase/admin'
import { priorPregameDate } from '@/lib/pregameFeatureDate'
import type { StatcastIntegrityResult } from '@/lib/statcastIntegrity'

type RequiredStatcastRow = {
  mlbId: number
  pitcherHand: 'L' | 'R'
}

type DerivedRow = {
  mlb_id: number
  pitcher_hand: string
  computed_at: string
}

type CategoryRow = {
  category: string
  last_synced_at: string
}

export const MECHANICS_STATCAST_CATEGORIES = [
  'bat_tracking',
  'batted_ball_splits',
  'swing_path_attack_angle',
  'swing_timing_miss_distance',
] as const

export type MechanicsReadinessStage =
  | 'historical'
  | 'integrity_missing'
  | 'official_schedule_pending'
  | 'pitch_log_incomplete'
  | 'integrity_failed'
  | 'statcast_categories_pending'
  | 'dugout_statcast_pending'
  | 'ready'

export type MechanicsReadiness = {
  ready: boolean
  stage: MechanicsReadinessStage
  reason: string
  gameDate: string
  requiredThroughDate: string
  freshnessBoundary: string | null
  missingProfiles: string[]
  retryAt: string | null
}

function todayEt() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function nextRetryIso() {
  const next = new Date()
  next.setUTCMinutes(38, 0, 0)
  if (next.getTime() <= Date.now()) next.setUTCHours(next.getUTCHours() + 1)
  return next.toISOString()
}

function numericTotal(values: Record<string, number> | undefined) {
  return Object.values(values ?? {}).reduce((sum, value) => sum + Number(value || 0), 0)
}

export function mechanicsStatcastRequirements(game: TodayGame): RequiredStatcastRow[] {
  const requirements = new Map<string, RequiredStatcastRow>()
  const add = (players: TodayGame['awayLineup'], hand: string | undefined) => {
    const pitcherHand = hand === 'L' ? 'L' : 'R'
    for (const player of players.slice(0, 9)) {
      requirements.set(`${player.mlb_id}:${pitcherHand}`, { mlbId: player.mlb_id, pitcherHand })
    }
  }
  add(game.awayLineup, game.homePitcher?.hand)
  add(game.homeLineup, game.awayPitcher?.hand)
  return [...requirements.values()]
}

export function evaluateMechanicsReadiness(input: {
  gameDate: string
  currentDate?: string
  audit: StatcastIntegrityResult | null
  requirements: RequiredStatcastRow[]
  derivedRows: DerivedRow[]
  categoryRows?: CategoryRow[]
}): MechanicsReadiness {
  const { gameDate, audit, requirements, derivedRows } = input
  const requiredThroughDate = priorPregameDate(gameDate)
  if (gameDate < (input.currentDate ?? todayEt())) {
    return {
      ready: true,
      stage: 'historical',
      reason: `Historical board uses its frozen pregame cache through ${requiredThroughDate}.`,
      gameDate,
      requiredThroughDate,
      freshnessBoundary: null,
      missingProfiles: [],
      retryAt: null,
    }
  }

  const base = {
    gameDate,
    requiredThroughDate,
    freshnessBoundary: null,
    missingProfiles: [] as string[],
    retryAt: nextRetryIso(),
  }
  if (!audit || audit.through_date !== requiredThroughDate) {
    return { ...base, ready: false, stage: 'integrity_missing', reason: `Waiting for the canonical Statcast audit through ${requiredThroughDate}.` }
  }
  if (!audit.checks.official_schedule?.source_available) {
    return { ...base, ready: false, stage: 'official_schedule_pending', reason: `MLB's finalized schedule for ${requiredThroughDate} is not available yet.` }
  }
  const missingFinalGames = Number(audit.checks.official_schedule.final_games_without_pitch_log || 0)
  if (missingFinalGames > 0) {
    return { ...base, ready: false, stage: 'pitch_log_incomplete', reason: `Waiting for Statcast pitch logs from ${missingFinalGames} finalized game${missingFinalGames === 1 ? '' : 's'} on ${requiredThroughDate}.` }
  }

  const pitch = audit.checks.pitch_log ?? {}
  const structuralGaps = numericTotal(pitch.raw_to_typed_gaps)
    + Number(pitch.classification_mismatches || 0)
    + Number(pitch.terminal_events_without_description || 0)
    + Number(pitch.fair_balls_without_event || 0)
  const nonCategoryFailures = Math.max(0, Number(audit.summary.failures || 0) - Number(audit.checks.category_freshness?.stale_categories || 0))
  if (nonCategoryFailures > 0 || structuralGaps > 0) {
    return { ...base, ready: false, stage: 'integrity_failed', reason: `Statcast is present but failed event integrity (${Math.max(nonCategoryFailures, structuralGaps)} canonical gaps).` }
  }

  const auditTime = new Date(audit.created_at).getTime()
  const categoryCutoff = auditTime - 2 * 60 * 60_000
  const categoryMap = new Map((input.categoryRows ?? []).map(row => [row.category, row.last_synced_at]))
  const missingCategories = MECHANICS_STATCAST_CATEGORIES.filter(category => {
    const syncedAt = categoryMap.get(category)
    return !syncedAt || new Date(syncedAt).getTime() < categoryCutoff
  })
  if (missingCategories.length) {
    return {
      ...base,
      ready: false,
      stage: 'statcast_categories_pending',
      reason: `Waiting for current ${missingCategories.join(', ')} Statcast data.`,
    }
  }

  const rowMap = new Map(derivedRows.map(row => [`${row.mlb_id}:${row.pitcher_hand}`, row]))
  const missingProfiles = requirements
    .filter(requirement => {
      const row = rowMap.get(`${requirement.mlbId}:${requirement.pitcherHand}`)
      return !row || new Date(row.computed_at).getTime() < auditTime
    })
    .map(requirement => `${requirement.mlbId}:${requirement.pitcherHand}`)
  if (missingProfiles.length) {
    return {
      ...base,
      ready: false,
      stage: 'dugout_statcast_pending',
      reason: `Canonical Statcast is ready; waiting for ${missingProfiles.length} game-specific batter profile${missingProfiles.length === 1 ? '' : 's'} to rebuild.`,
      missingProfiles,
    }
  }

  const freshnessBoundary = [audit.created_at, ...derivedRows.map(row => row.computed_at)]
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? audit.created_at
  return {
    ready: true,
    stage: 'ready',
    reason: `Verified through ${requiredThroughDate}; every required game profile was rebuilt after the integrity audit.`,
    gameDate,
    requiredThroughDate,
    freshnessBoundary,
    missingProfiles: [],
    retryAt: null,
  }
}

export class StatcastSourcesNotReadyError extends Error {
  readonly readiness: MechanicsReadiness

  constructor(readiness: MechanicsReadiness) {
    super(readiness.reason)
    this.name = 'StatcastSourcesNotReadyError'
    this.readiness = readiness
  }
}

export async function getMechanicsStatcastReadiness(game: TodayGame, gameDate: string): Promise<MechanicsReadiness> {
  const requirements = mechanicsStatcastRequirements(game)
  if (gameDate < todayEt()) return evaluateMechanicsReadiness({ gameDate, audit: null, requirements, derivedRows: [] })

  const admin = createAdminClient()
  const requiredThroughDate = priorPregameDate(gameDate)
  const playerIds = [...new Set(requirements.map(requirement => requirement.mlbId))]
  const [{ data: auditData, error: auditError }, { data: rowsData, error: rowsError }, categoryResults] = await Promise.all([
    admin.from('statcast_integrity_runs')
      .select('id,season,through_date,status,summary,checks,created_at')
      .eq('through_date', requiredThroughDate)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    playerIds.length
      ? admin.from('dugout_statcast_precomputed')
        .select('mlb_id,pitcher_hand,computed_at')
        .eq('game_date', gameDate)
        .in('mlb_id', playerIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(MECHANICS_STATCAST_CATEGORIES.map(category => admin.from('player_statcast_splits')
      .select('category,last_synced_at')
      .eq('category', category)
      .order('last_synced_at', { ascending: false })
      .limit(1)
      .maybeSingle())),
  ])
  if (auditError) throw auditError
  if (rowsError) throw rowsError
  const categoryError = categoryResults.find(result => result.error)?.error
  if (categoryError) throw categoryError
  return evaluateMechanicsReadiness({
    gameDate,
    audit: auditData as StatcastIntegrityResult | null,
    requirements,
    derivedRows: (rowsData ?? []) as DerivedRow[],
    categoryRows: categoryResults.flatMap(result => result.data ? [result.data as CategoryRow] : []),
  })
}

export async function assertMechanicsStatcastReady(game: TodayGame, gameDate: string) {
  const readiness = await getMechanicsStatcastReadiness(game, gameDate)
  if (!readiness.ready) throw new StatcastSourcesNotReadyError(readiness)
  return readiness
}
