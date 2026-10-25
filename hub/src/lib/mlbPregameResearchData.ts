import 'server-only'
import { createAdminClient } from './supabase/admin'

export type MlbResearchGame = { gamePk: string | number; gameDate: string; status?: { detailedState?: string; abstractGameState?: string } }
export type MlbResearchSnapshot<T> = { value: T; observedAt: string; startAt: string; frozen: boolean; source: 'capture' | 'recovered-cache' }
type Stored<T> = { payload: T; observed_at: string; start_at: string; source: MlbResearchSnapshot<T>['source'] }
export class MlbPregameResearchUnavailable extends Error {
  constructor() { super('Pregame MLB research snapshot unavailable'); this.name = 'MlbPregameResearchUnavailable' }
}
export function mlbPregameResearchOpen(game: MlbResearchGame) {
  const start = Date.parse(game.gameDate)
  const state = game.status?.detailedState ?? ''
  return Number.isFinite(start) && Date.now() < start && (!state || ['Scheduled', 'Pre-Game', 'Warmup', 'Delayed Start', 'Delayed'].includes(state))
}
const reads = new Map<string, Promise<Stored<unknown> | null>>()
function params(game: MlbResearchGame, resource: string) {
  if (!/^(board:v1|pitchlog:\d+|pitcher-window:\d+:([1-9]|10))$/.test(resource)) throw new MlbPregameResearchUnavailable()
  if (!/^\d+$/.test(String(game.gamePk)) || !Number.isFinite(Date.parse(game.gameDate))) throw new MlbPregameResearchUnavailable()
  return { p_game_pk: String(game.gamePk), p_resource: resource, p_start: new Date(game.gameDate).toISOString() }
}
function decode<T>(game: MlbResearchGame, row: Stored<T> | null): MlbResearchSnapshot<T> | null {
  const start = Math.min(Date.parse(game.gameDate), Date.parse(row?.start_at ?? ''))
  const observed = Date.parse(row?.observed_at ?? '')
  if (!row || row.payload == null || !Number.isFinite(start) || !Number.isFinite(observed) || observed >= start || observed > Date.now() || !['capture', 'recovered-cache'].includes(row.source)) return null
  return { value: structuredClone(row.payload), observedAt: row.observed_at, startAt: new Date(start).toISOString(), frozen: !mlbPregameResearchOpen(game) || Date.now() >= start, source: row.source }
}
export async function readMlbPregameResearch<T>(game: MlbResearchGame, resource = 'board:v1'): Promise<MlbResearchSnapshot<T> | null> {
  const args = params(game, resource), open = mlbPregameResearchOpen(game)
  const key = `${args.p_game_pk}:${resource}:${args.p_start}:${open}`
  let pending = reads.get(key)
  if (!pending) {
    pending = (async () => {
      const read = async () => {
        const { data, error } = await createAdminClient().rpc('read_mlb_pregame_research', args).abortSignal(AbortSignal.timeout(12_000))
        if (error) throw new Error('MLB research archive unavailable')
        return data as Stored<T> | null
      }
      let row = await read()
      // Await the same game lock after cutoff, including any pre-start writer.
      if (open && (!mlbPregameResearchOpen(game) || (row && Date.now() >= Date.parse(row.start_at)))) row = await read()
      return row
    })()
    reads.set(key, pending)
  }
  try { return decode(game, await pending as Stored<T> | null) }
  finally { if (reads.get(key) === pending) reads.delete(key) }
}
export async function mlbPregameResearch<T>(game: MlbResearchGame, load: () => Promise<{ value: T; observedAt: string }>, resource = 'board:v1'): Promise<MlbResearchSnapshot<T>> {
  const prior = await readMlbPregameResearch<T>(game, resource)
  if (prior?.frozen) return prior
  if (!mlbPregameResearchOpen(game)) {
    if (!prior) throw new MlbPregameResearchUnavailable()
    return prior
  }
  try {
    const entry = await load(), observed = Date.parse(entry.observedAt)
    if (!Number.isFinite(observed) || observed > Date.now()) throw new MlbPregameResearchUnavailable()
    if (!mlbPregameResearchOpen(game)) {
      const final = await readMlbPregameResearch<T>(game, resource)
      if (!final) throw new MlbPregameResearchUnavailable()
      return final
    }
    if (Buffer.byteLength(JSON.stringify(entry.value)) > 8 * 1024 * 1024) throw new Error('MLB research snapshot exceeds size limit')
    const { data, error } = await createAdminClient().rpc('capture_mlb_pregame_research', { ...params(game, resource), p_observed_at: entry.observedAt, p_payload: entry.value }).abortSignal(AbortSignal.timeout(12_000))
    if (error) throw new Error('MLB research could not be archived')
    const row = data as Stored<T> | null
    const final = !mlbPregameResearchOpen(game) || (row && Date.now() >= Date.parse(row.start_at))
      ? await readMlbPregameResearch<T>(game, resource) : decode(game, row)
    if (!final) throw new MlbPregameResearchUnavailable()
    return final
  } catch (failure) {
    const final = await readMlbPregameResearch<T>(game, resource)
    if (final) return final
    throw failure
  }
}
