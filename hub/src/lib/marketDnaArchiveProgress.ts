export const STRICT_ARCHIVE_VERSION = 'canonical-v3-strict-mechanics'
export const STRICT_ARCHIVE_START = '2026-07-16'
export const MAX_ARCHIVE_DATES = 2
export const MAX_ARCHIVE_SCAN_DATES = 31

export type ArchiveCoverage = { game_date: string; source_version: string | null }
export type ArchiveProgress = {
  game_date: string
  status: 'no_games' | 'complete' | 'incomplete'
}

export function shiftArchiveDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

// Existing non-strict dates and interrupted work retain priority. Empty-day
// checkpoints only advance contiguous progress; a later checkpoint cannot
// conceal an earlier failed or unvisited date.
export function planArchiveDates(coverage: ArchiveCoverage[], progress: ArchiveProgress[], throughDate: string) {
  const captured = [...new Set(coverage.map(row => row.game_date))].sort()
  const strict = new Set(coverage.filter(row => row.source_version === STRICT_ARCHIVE_VERSION).map(row => row.game_date))
  const done = new Set(progress.filter(row => row.status !== 'incomplete').map(row => row.game_date))
  const retry = [...new Set([
    ...captured.filter(date => !strict.has(date)),
    ...progress.filter(row => row.status === 'incomplete').map(row => row.game_date),
  ])].filter(date => date >= STRICT_ARCHIVE_START && date <= throughDate).sort().slice(0, MAX_ARCHIVE_DATES)
  const forward: string[] = []
  let date = captured.length ? shiftArchiveDate(captured.at(-1)!, 1) : STRICT_ARCHIVE_START
  while (date <= throughDate && done.has(date)) date = shiftArchiveDate(date, 1)
  for (let scanned = 0; date <= throughDate && scanned < MAX_ARCHIVE_SCAN_DATES; scanned++, date = shiftArchiveDate(date, 1)) {
    if (!done.has(date) && !retry.includes(date)) forward.push(date)
  }
  return { retry, forward, strictDates: strict.size }
}

export function parseArchiveSchedule(payload: unknown, start: string, end: string): Map<string, number[]> {
  const fail = () => { throw new Error('Archive schedule was incomplete or invalid; progress was not advanced.') }
  if (!payload || typeof payload !== 'object') return fail()
  const body = payload as Record<string, unknown>
  if (!Number.isSafeInteger(body.totalGames) || (body.totalGames as number) < 0 || !Array.isArray(body.dates)) return fail()
  const dates = new Map<string, number[]>()
  for (let date = start; date <= end; date = shiftArchiveDate(date, 1)) dates.set(date, [])
  const seen = new Set<number>()
  const seenDates = new Set<string>()
  for (const value of body.dates) {
    if (!value || typeof value !== 'object') return fail()
    const item = value as Record<string, unknown>
    if (typeof item.date !== 'string' || !dates.has(item.date) || seenDates.has(item.date) || !Array.isArray(item.games)) return fail()
    seenDates.add(item.date)
    const ids: number[] = []
    for (const value of item.games) {
      if (!value || typeof value !== 'object') return fail()
      const game = value as Record<string, unknown>
      if (!Number.isSafeInteger(game.gamePk) || (game.gamePk as number) <= 0 || seen.has(game.gamePk as number)) return fail()
      if (game.officialDate !== undefined && game.officialDate !== item.date) return fail()
      seen.add(game.gamePk as number)
      ids.push(game.gamePk as number)
    }
    if (item.totalGames !== undefined && item.totalGames !== ids.length) return fail()
    dates.set(item.date, ids.sort((a, b) => a - b))
  }
  if (seen.size !== body.totalGames) return fail()
  return dates
}

export async function readArchiveSchedule(start: string, end: string) {
  const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${start}&endDate=${end}`, {
    cache: 'no-store', signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Archive schedule unavailable (HTTP ${response.status}); progress was not advanced.`)
  return parseArchiveSchedule(await response.json(), start, end)
}

export function archiveResultComplete(expectedIds: number[], result: { games: number; players: number; skipped: number; gameIds: number[] }) {
  return expectedIds.length > 0 && result.skipped === 0 && result.games === expectedIds.length
    && result.players >= 18 * expectedIds.length
    && result.gameIds.length === expectedIds.length
    && new Set(result.gameIds).size === expectedIds.length
    && expectedIds.every(id => result.gameIds.includes(id))
}
