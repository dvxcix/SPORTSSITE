import 'server-only'
import { normName } from '@slipsurge/core/nameNorm'

type Player = { id: number; name: string }
type ArchiveEntry = { name?: string } & Record<string, unknown>
type Capture = { captured_at: string; prop_map: Record<string, ArchiveEntry> }
type Quote = { playerId: number; market: string; book: string; line: number | null; points: { time: string; odds: number }[] }

const markets = new Set(['fhr', 'sa', 'hr2', 'hr3', 'hits', 'hits2', 'hits3', 'singles', 'singles2', 'doubles', 'triples',
  'rbi', 'rbi2', 'rbi3', 'runs', 'runs2', 'hrr', 'hrr3', 'tb', 'tb3', 'tb4', 'tb5', 'stolen_bases', 'stolen_bases2',
  'strikeouts', 'strikeouts2', 'strikeouts3'])
const books = new Set(['fanduel', 'draftkings', 'caesars', 'fanatics', 'betmgm', 'betrivers'])

export function nativeMlbOddsHistory(players: Player[], snapshots: Capture[], firstPitchAt: string | null) {
  const roster = new Map<string, number | null>()
  for (const player of players) {
    const name = normName(player.name)
    const present = roster.get(name)
    if (name) roster.set(name, present === undefined || present === player.id ? player.id : null)
  }
  const contracts = new Map<string, Quote>()
  const thresholds = new Map<string, number>()
  const boundary = firstPitchAt == null ? Infinity : Date.parse(firstPitchAt)
  const entriesByTime = new Map<number, ArchiveEntry[]>()
  for (const capture of snapshots) {
    const time = Date.parse(capture.captured_at)
    if (!Number.isFinite(time) || !(time < boundary)) continue
    const entries = entriesByTime.get(time) ?? []
    entries.push(...Object.values(capture.prop_map))
    entriesByTime.set(time, entries)
  }
  for (const [time, entries] of [...entriesByTime].sort(([left], [right]) => left - right)) {
    // Multiple sources can name the same athlete in one capture. A conflicting
    // price for the exact same contract at that timestamp stays unavailable.
    const prices = new Map<string, { contract: Quote; odds: number } | null>()
    const identities = entries.flatMap(archive => {
      const id = typeof archive.name === 'string' ? roster.get(normName(archive.name)) : null
      return id ? [{ playerId: id, archive }] : []
    })
    const currentThresholds = new Map<string, number | null>()
    for (const { playerId, archive } of identities) {
      if (archive.hrr_line && typeof archive.hrr_line === 'object') {
        for (const [book, line] of Object.entries(archive.hrr_line)) {
          const numeric = typeof line === 'number' || typeof line === 'string' ? Number(line) : NaN
          if (!books.has(book) || !(numeric > 0 && numeric < 100)) continue
          const identity = `${playerId}:${book}`
          const existing = currentThresholds.get(identity)
          currentThresholds.set(identity, existing !== undefined && existing !== numeric ? null : numeric)
        }
      }
    }
    for (const [key, value] of currentThresholds) {
      if (value == null) thresholds.delete(key)
      else thresholds.set(key, value)
    }
    for (const { playerId, archive } of identities) {
      for (const [market, values] of Object.entries(archive)) {
        if (!markets.has(market) || !values || typeof values !== 'object' || Array.isArray(values)) continue
        for (const [book, value] of Object.entries(values)) {
          const odds = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
          if (!books.has(book) || !Number.isSafeInteger(odds) || Math.abs(odds) < 100 || Math.abs(odds) > 1_000_000) continue
          const thresholdKey = `${playerId}:${book}`
          if (market === 'hrr' && currentThresholds.get(thresholdKey) === null) continue
          const line = market === 'hrr' ? thresholds.get(thresholdKey) ?? null : null
          const identity = `${playerId}:${market}:${book}:${line ?? ''}`
          const contract = contracts.get(identity) ?? { playerId, market, book, line, points: [] }
          const existing = prices.get(identity)
          if (existing === null || existing && existing.odds !== odds) prices.set(identity, null)
          else prices.set(identity, { contract, odds })
        }
      }
    }
    const stamp = new Date(time).toISOString()
    for (const [identity, entry] of prices) {
      if (!entry) continue
      const { contract, odds } = entry
      const previous = contract.points.at(-1)
      if (previous?.odds !== odds) contract.points.push({ time: stamp, odds })
      contracts.set(identity, contract)
    }
  }
  return [...contracts.values()].filter(quote => quote.points.length > 0)
}
