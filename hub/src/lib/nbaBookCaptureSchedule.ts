import 'server-only'
import { createAdminClient } from './supabase/admin'
import type { PaintGame } from './nbaPaint'
import type { NbaFirstBook } from './nbaBookFirstData'
import { nbaBookCircuitKey, nbaBookScheduleKey, nbaValidBookCircuit, nbaValidBookSchedule, type NbaBookCircuit, type NbaBookScheduleState } from './nbaBookCapturePolicy'

/** Called only inside the stable per-book shared lease. No local-only state. */
export async function readNbaBookCaptureSchedule(book: NbaFirstBook, games: PaintGame[]) {
  const keys = games.map(game => nbaBookScheduleKey(book, game)), circuitKey = nbaBookCircuitKey(book)
  const { data, error } = await createAdminClient().from('nba_source_cache').select('key,payload').in('key', [...keys, circuitKey]).abortSignal(AbortSignal.timeout(12_000))
  if (error || !Array.isArray(data) || data.length > keys.length + 1 || new Set(data.map(row => row.key)).size !== data.length) throw new Error('NBA capture schedule unavailable')
  const states = new Map<number, NbaBookScheduleState>()
  let circuit: NbaBookCircuit | undefined
  for (const row of data) {
    if (row.key === circuitKey) {
      if (!nbaValidBookCircuit(row.payload)) throw new Error('NBA capture schedule invalid')
      circuit = row.payload
    } else {
      const game = games.find(candidate => nbaBookScheduleKey(book, candidate) === row.key)
      if (!game || !nbaValidBookSchedule(row.payload, book, game)) throw new Error('NBA capture schedule invalid')
      states.set(game.id, row.payload)
    }
  }
  return { states, circuit }
}
export async function writeNbaBookCaptureSchedule(book: NbaFirstBook, entries: { game: PaintGame; state: NbaBookScheduleState }[], circuit?: NbaBookCircuit) {
  if (entries.length > 30 || new Set(entries.map(entry => entry.game.id)).size !== entries.length || entries.some(({ game, state }) => !nbaValidBookSchedule(state, book, game)) || circuit && !nbaValidBookCircuit(circuit)) throw new Error('NBA capture schedule invalid')
  const now = Date.now(), stamp = new Date(now).toISOString()
  const rows: { key: string; payload: NbaBookScheduleState | NbaBookCircuit }[] = entries.map(({ game, state }) => ({ key: nbaBookScheduleKey(book, game), payload: state }))
  if (circuit) rows.push({ key: nbaBookCircuitKey(book), payload: circuit })
  if (!rows.length) return
  const { data, error } = await createAdminClient().from('nba_source_cache').upsert(rows.map(row => ({ ...row, fetched_at: stamp, expires_at: new Date(now + 7 * 86_400_000).toISOString(), lease_token: null, lease_until: null })), { onConflict: 'key' }).select('key').abortSignal(AbortSignal.timeout(12_000))
  if (error || !Array.isArray(data) || data.length !== rows.length || new Set(data.map(row => row.key)).size !== rows.length || data.some(row => !rows.some(expected => expected.key === row.key))) throw new Error('NBA capture schedule could not save')
}
