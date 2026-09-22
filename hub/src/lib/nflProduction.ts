import type { createAdminClient } from '@/lib/supabase/admin'

export function currentNflSeason(now = new Date()) {
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
}

export type NflProductionCoverage = {
  season: number
  rows: number
  coveredGames: number
  completedGames: number
  missingGames: string[]
}

/** Durable weekly production, independent of NGS qualification thresholds. */
export async function refreshNflProduction(admin: ReturnType<typeof createAdminClient>, season: number) {
  const { data, error } = await admin.rpc('refresh_nfl_production', { p_season: season })
  if (error) throw new Error(`NFL production rebuild failed: ${error.message}`)
  const coverage = data as NflProductionCoverage | null
  if (!coverage || !Array.isArray(coverage.missingGames)) throw new Error('NFL production returned no coverage report')
  return coverage
}
