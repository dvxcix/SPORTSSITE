/** An account with no enabled matrices needs one check, not one per slate game. */
export async function loadNbaMatrixGames<T extends { matrices?: unknown[] }>(
  gameIds: number[],
  load: (gameId: number) => Promise<T>,
): Promise<{ results: T[]; failed: number }> {
  const results: T[] = []
  let failed = 0
  if (!gameIds.length) return { results, failed }
  try {
    const first = await load(gameIds[0])
    results.push(first)
    if (Array.isArray(first.matrices) && first.matrices.length === 0) return { results, failed }
  } catch { failed++ }
  for (let offset = 1; offset < gameIds.length; offset += 3) {
    const batch = await Promise.allSettled(gameIds.slice(offset, offset + 3).map(load))
    for (const result of batch) {
      if (result.status === 'fulfilled') results.push(result.value)
      else failed++
    }
  }
  return { results, failed }
}
