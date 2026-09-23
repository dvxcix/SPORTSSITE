type BatchResult = { count: number; error: unknown | null; remaining: boolean }
/** Bound each delete transaction; a backlog must not become one giant query.
 * The callbacks must apply the same retention predicate to reads and deletes. */
export async function pruneInBatches(
  select: () => PromiseLike<{ data: { id: string | number }[] | null; error: unknown | null }>,
  remove: (ids: (string | number)[]) => PromiseLike<{ count: number | null; error: unknown | null }>,
  deadline: number,
): Promise<BatchResult> {
  let count = 0
  while (Date.now() < deadline) {
    const batch = await select()
    if (batch.error) return { count, error: batch.error, remaining: true }
    if (!batch.data?.length) return { count, error: null, remaining: false }
    const result = await remove(batch.data.map(row => row.id))
    if (result.error) return { count, error: result.error, remaining: true }
    count += result.count ?? 0
    if (!result.count) return { count, error: new Error('Retention delete made no progress'), remaining: true }
  }
  return { count, error: null, remaining: true }
}
