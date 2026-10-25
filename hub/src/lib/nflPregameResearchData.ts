import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import type { SidelineGame } from '@/app/the-sideline/types'

export type NflResearchSnapshot<T> = { value: T; observedAt: string; frozen: boolean; source: 'capture' | 'recovered-cache' }
type Stored<T> = { payload: T; observed_at: string; kickoff_at: string; source: NflResearchSnapshot<T>['source'] }
export class NflPregameResearchUnavailable extends Error {
  constructor() { super('Pregame NFL research snapshot unavailable'); this.name = 'NflPregameResearchUnavailable' }
}
export function nflPregameOpen(game: SidelineGame) { const time = nflKickoffAt(game)?.getTime(); return time != null && time > Date.now() }
const reading = new Map<string, Promise<Stored<unknown> | null>>()
const saving = new Map<string, Promise<Stored<unknown> | null>>()
function args(game: SidelineGame, resource: string) {
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(resource)) throw new Error('Invalid NFL research resource')
  const kickoff = nflKickoffAt(game)
  if (!kickoff) throw new NflPregameResearchUnavailable()
  return { p_game_id: game.id, p_resource: resource, p_version: 1, p_kickoff: kickoff.toISOString() }
}
function decoded<T>(game: SidelineGame, row: Stored<T> | null): NflResearchSnapshot<T> | null {
  const start = nflKickoffAt(game)?.getTime(), stored = Date.parse(row?.kickoff_at ?? ''), observed = Date.parse(row?.observed_at ?? '')
  if (!row || row.payload == null || start == null || !Number.isFinite(stored) || !Number.isFinite(observed) || observed >= Math.min(start, stored) || observed > Date.now() || !['capture', 'recovered-cache'].includes(row.source)) return null
  return { value: row.payload, observedAt: row.observed_at, frozen: Date.now() >= Math.min(start, stored), source: row.source }
}
export async function readNflPregameResearch<T>(game: SidelineGame, resource: string): Promise<NflResearchSnapshot<T> | null> {
  const params = args(game, resource), open = nflPregameOpen(game)
  const key = `${game.id}:${resource}:${params.p_kickoff}:${open}`
  let pending = reading.get(key)
  if (!pending) {
    pending = (async () => {
      const read = async () => {
        const { data, error } = await createAdminClient().rpc('read_nfl_pregame_research', params).abortSignal(AbortSignal.timeout(12_000))
        if (error) throw new Error('NFL research archive unavailable')
        return data as Stored<T> | null
      }
      let row = await read()
      // A read begun before kickoff may precede the final writer's commit.
      if (open && (!nflPregameOpen(game) || (row && Date.now() >= Date.parse(row.kickoff_at)))) row = await read()
      return row
    })()
    reading.set(key, pending)
  }
  try { return decoded(game, structuredClone(await pending) as Stored<T> | null) }
  finally { if (reading.get(key) === pending) reading.delete(key) }
}
export async function saveNflPregameResearch<T>(game: SidelineGame, resource: string, entry: { value: T; observedAt: string }): Promise<NflResearchSnapshot<T> | null> {
  const params = args(game, resource), observed = Date.parse(entry.observedAt)
  if (!nflPregameOpen(game) || !Number.isFinite(observed) || observed >= Date.parse(params.p_kickoff) || observed > Date.now()) return readNflPregameResearch(game, resource)
  if (Buffer.byteLength(JSON.stringify(entry.value)) > 8 * 1024 * 1024) throw new Error('NFL research snapshot exceeds size limit')
  const key = `${game.id}:${resource}:${entry.observedAt}`
  let pending = saving.get(key)
  if (!pending) {
    pending = (async () => {
      const { data, error } = await createAdminClient().rpc('capture_nfl_pregame_research', { ...params, p_observed_at: entry.observedAt, p_payload: entry.value }).abortSignal(AbortSignal.timeout(12_000))
      if (error) throw new Error('NFL research could not be archived')
      return data as Stored<T> | null
    })()
    saving.set(key, pending)
  }
  try {
    const row = structuredClone(await pending) as Stored<T> | null
    if (!nflPregameOpen(game) || (row && Date.now() >= Date.parse(row.kickoff_at))) return await readNflPregameResearch(game, resource)
    return decoded(game, row)
  } finally { if (saving.get(key) === pending) saving.delete(key) }
}
export async function nflPregameResearch<T>(game: SidelineGame, resource: string, load: () => Promise<{ value: T; observedAt: string }>): Promise<NflResearchSnapshot<T>> {
  const prior = await readNflPregameResearch<T>(game, resource)
  if (prior?.frozen) return prior
  if (!nflPregameOpen(game)) {
    if (!prior) throw new NflPregameResearchUnavailable()
    return prior
  }
  try {
    const entry = await load(), result = await saveNflPregameResearch(game, resource, entry)
    if (!result) throw new NflPregameResearchUnavailable()
    return result
  } catch (failure) {
    const archived = await readNflPregameResearch<T>(game, resource)
    if (archived) return archived
    throw failure
  }
}
