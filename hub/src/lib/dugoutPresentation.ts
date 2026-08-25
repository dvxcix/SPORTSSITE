export type DugoutViewPreset = 'all' | 'markets' | 'props' | 'ranks' | 'mechanics' | 'statcast'

export type DugoutHistoryEntry = { name?: string; [market: string]: unknown }
export type DugoutHistorySnapshot = { captured_at: string; prop_map: Record<string, DugoutHistoryEntry> }
export type DugoutTimelinePlayer = { fhr?: number; sa?: number }
export type DugoutTimelinePoint = { capturedAt: string; players: Map<string, DugoutTimelinePlayer> }

const PRESET_GROUPS: Record<Exclude<DugoutViewPreset, 'all'>, ReadonlySet<string>> = {
  markets: new Set(['picks', 'fhr', 'hr']),
  props: new Set(['picks', 'props']),
  ranks: new Set(['mechanics', 'picks', 'ranks']),
  mechanics: new Set(['mechanics', 'batspeed']),
  statcast: new Set(['mechanics', 'barrel']),
}

// Presets are temporary lenses over a member's saved columns. They never add
// hidden columns, rewrite order, or mutate the supplied array.
export function applyDugoutViewPreset<T extends { key: string; group: string }>(columns: T[], preset: DugoutViewPreset): T[] {
  if (preset === 'all') return columns
  const groups = PRESET_GROUPS[preset]
  return columns.filter(column => groups.has(column.group))
}

function numericHistoryPrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

// The endpoint returns compact deltas. This rebuilds cumulative board state
// only at captures where an actual FanDuel FHR/HR price changed.
export function buildDugoutMarketTimeline(
  snapshots: DugoutHistorySnapshot[],
  normalizeName: (value: string) => string = value => value.trim().toLowerCase(),
): DugoutTimelinePoint[] {
  const latest = new Map<string, DugoutTimelinePlayer>()
  const timeline: DugoutTimelinePoint[] = []

  for (const snapshot of snapshots) {
    let changed = false
    for (const [providerKey, entry] of Object.entries(snapshot.prop_map ?? {})) {
      const playerKey = normalizeName(entry?.name || providerKey)
      if (!playerKey || !entry || typeof entry !== 'object') continue
      const previous = latest.get(playerKey) ?? {}
      const next = { ...previous }

      for (const market of ['fhr', 'sa'] as const) {
        const books = entry[market]
        if (!books || typeof books !== 'object' || Array.isArray(books)) continue
        const price = numericHistoryPrice((books as Record<string, unknown>).fanduel)
        if (price == null || next[market] === price) continue
        next[market] = price
        changed = true
      }
      latest.set(playerKey, next)
    }
    if (changed) timeline.push({ capturedAt: snapshot.captured_at, players: new Map(latest) })
  }

  return timeline
}
