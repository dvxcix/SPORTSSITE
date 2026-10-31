/** Small, presentation-only helpers for already saved MLB observations. */
export function isArchiveDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function isBeforeSavedCutoff(observed: unknown, cutoff: unknown, now = Date.now()): boolean {
  if (typeof observed !== 'string' || typeof cutoff !== 'string') return false
  const observedMs = Date.parse(observed), cutoffMs = Date.parse(cutoff)
  return Number.isFinite(observedMs) && Number.isFinite(cutoffMs) && observedMs < cutoffMs && observedMs <= now
}

export type SavedMlbQuote = { player: string; playerKey: string; market: string; book: string; value: string }

/** Preserve each saved market/book value verbatim; never infer a line or price. */
export function savedMlbQuotes(value: unknown, maxRows = 1500): { rows: SavedMlbQuote[]; truncated: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { rows: [], truncated: false }
  const rows: SavedMlbQuote[] = []
  let truncated = false
  for (const [playerKey, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const player = typeof (raw as Record<string, unknown>).name === 'string' ? (raw as Record<string, string>).name : playerKey
    for (const [market, offers] of Object.entries(raw)) {
      if (!offers || typeof offers !== 'object' || Array.isArray(offers)) continue
      for (const [book, offer] of Object.entries(offers)) {
        if ((typeof offer !== 'number' || !Number.isFinite(offer)) && typeof offer !== 'string') continue
        if (rows.length >= maxRows) { truncated = true; continue }
        rows.push({ player, playerKey, market, book, value: String(offer) })
      }
    }
  }
  return { rows, truncated }
}
