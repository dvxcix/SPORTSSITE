export type DugoutViewPreset = 'signal' | 'market' | 'power' | 'props' | 'all' | 'custom'

export type DugoutHistoryEntry = { name?: string; [market: string]: unknown }
export type DugoutHistorySnapshot = { captured_at: string; prop_map: Record<string, DugoutHistoryEntry> }
export type DugoutTimelineBooks = Partial<Record<'fanduel' | 'williamhill_us' | 'betmgm' | 'betrivers' | 'fanatics', number>>
export type DugoutTimelinePlayer = Partial<Record<string, DugoutTimelineBooks>>
export type DugoutTimelinePoint = { capturedAt: string; players: Map<string, DugoutTimelinePlayer> }

const PRESET_GROUPS: Record<Exclude<DugoutViewPreset, 'all' | 'custom'>, ReadonlySet<string>> = {
  signal: new Set(['mechanics', 'picks', 'fhr', 'hr', 'ranks']),
  market: new Set(['picks', 'fhr', 'hr', 'props']),
  power: new Set(['mechanics', 'hr', 'batspeed', 'barrel']),
  props: new Set(['picks', 'props']),
}

// Presets are temporary lenses over a member's saved columns. They never add
// hidden columns, rewrite order, or mutate the supplied array.
export function applyDugoutViewPreset<T extends { key: string; group: string }>(columns: T[], preset: DugoutViewPreset): T[] {
  if (preset === 'all' || preset === 'custom') return columns
  const groups = PRESET_GROUPS[preset]
  return columns.filter(column => groups.has(column.group))
}

function numericHistoryPrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const TIMELINE_MARKETS = [
  'fhr', 'sa',
  'singles', 'doubles', 'triples',
  'stolen_bases', 'stolen_bases2',
  'hits', 'hits2', 'runs', 'runs2',
  'rbi', 'rbi2', 'rbi3',
  'tb', 'tb3', 'tb4', 'tb5', 'hrr', 'hr2',
  'moonshot', 'laser105', 'laser110', 'pa1', 'hrMl',
] as const
const TIMELINE_BOOKS = ['fanduel', 'williamhill_us', 'betmgm', 'betrivers', 'fanatics'] as const

// Rebuild compact capture deltas into cumulative player state. The board can
// now scrub every relevant book/market instead of pretending FHR and HR are
// the whole story.
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
      const next: DugoutTimelinePlayer = { ...previous }

      for (const market of TIMELINE_MARKETS) {
        const books = entry[market]
        if (!books || typeof books !== 'object' || Array.isArray(books)) continue
        const nextBooks: DugoutTimelineBooks = { ...(next[market] ?? {}) }
        for (const book of TIMELINE_BOOKS) {
          const price = numericHistoryPrice((books as Record<string, unknown>)[book])
          if (price == null || nextBooks[book] === price) continue
          nextBooks[book] = price
          changed = true
        }
        if (Object.keys(nextBooks).length) next[market] = nextBooks
      }
      latest.set(playerKey, next)
    }
    if (changed) timeline.push({ capturedAt: snapshot.captured_at, players: new Map(latest) })
  }

  return timeline
}
