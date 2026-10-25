import 'server-only'
import { createAdminClient } from './supabase/admin'
import { getNbaOddsGame } from './nbaOddsClockData'
import { nbaGameStart, nbaPregameOpen } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'

export type NbaPregameResearchSnapshot<T> = {
  value: T
  observedAt: string
  source: 'capture' | 'recovered-cache'
  frozen: boolean
}
type Stored<T> = { payload: T; observed_at: string; tipoff_at: string; source: NbaPregameResearchSnapshot<T>['source'] }
export class NbaPregameResearchUnavailable extends Error {
  constructor() { super('Pregame research snapshot unavailable'); this.name = 'NbaPregameResearchUnavailable' }
}
const version = 1
const memory = new Map<string, { row: Stored<unknown>; until: number; bytes: number; closed: boolean }>()
const saving = new Map<string, Promise<Stored<unknown> | null>>()
const reading = new Map<string, Promise<Stored<unknown> | null>>()
let memoryBytes = 0
const cacheKey = (game: PaintGame, resource: string) => `${game.id}:${resource}:${version}`
function forget(game: PaintGame, resource: string) {
  const key = cacheKey(game, resource), prior = memory.get(key)
  if (prior) { memory.delete(key); memoryBytes -= prior.bytes }
}
function remember<T>(game: PaintGame, resource: string, row: Stored<T> | null) {
  if (!row) return
  const key = cacheKey(game, resource), prior = memory.get(key), bytes = Buffer.byteLength(JSON.stringify(row))
  if (prior) { memory.delete(key); memoryBytes -= prior.bytes }
  if (bytes > 32 * 1024 * 1024) return
  const closed = !nbaPregameOpen(game) || Date.now() >= Date.parse(row.tipoff_at)
  const until = closed ? Date.now() + 300_000 : Math.min(Date.now() + 5_000, Date.parse(row.tipoff_at))
  memory.set(key, { row: structuredClone(row), bytes, until, closed }); memoryBytes += bytes
  while (memory.size > 128 || memoryBytes > 32 * 1024 * 1024) {
    const oldest = memory.keys().next().value!, entry = memory.get(oldest)!
    memory.delete(oldest); memoryBytes -= entry.bytes
  }
}
function snapshot<T>(game: PaintGame, row: Stored<T> | null): NbaPregameResearchSnapshot<T> | null {
  const tip = nbaGameStart(game), storedTip = Date.parse(row?.tipoff_at ?? ''), observed = Date.parse(row?.observed_at ?? '')
  if (!row || row.payload == null || tip == null || !Number.isFinite(storedTip) || !Number.isFinite(observed) || observed >= Math.min(tip, storedTip) || observed > Date.now()) return null
  if (row.source !== 'capture' && row.source !== 'recovered-cache') return null
  return { value: row.payload, observedAt: row.observed_at, source: row.source, frozen: !nbaPregameOpen(game) || Date.now() >= storedTip }
}
function validResource(resource: string) { if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(resource)) throw new Error('Invalid NBA research resource') }

/** Durable data, deliberately outside the seven-day ephemeral source cache. */
export async function readNbaPregameResearch<T>(game: PaintGame, resource: string): Promise<NbaPregameResearchSnapshot<T> | null> {
  validResource(resource)
  game = await getNbaOddsGame(game)
  const hit = memory.get(cacheKey(game, resource))
  if (hit && hit.until > Date.now() && (hit.closed || nbaPregameOpen(game))) return snapshot(game, structuredClone(hit.row) as Stored<T>)
  const read = async () => {
    const tip = nbaGameStart(game)
    if (tip == null) return null
    const { data, error } = await createAdminClient().rpc('read_nba_pregame_research', {
      p_game_id: game.id, p_resource: resource, p_version: version, p_tipoff: new Date(tip).toISOString(),
    }).abortSignal(AbortSignal.timeout(12_000))
    if (error) throw new Error('Pregame research archive unavailable')
    return data as Stored<T> | null
  }
  const beganOpen = nbaPregameOpen(game)
  // A post-tip caller must not join a read that started before the final write.
  const key = `${cacheKey(game, resource)}:${nbaGameStart(game)}:${beganOpen}`
  let pending = reading.get(key)
  if (!pending) {
    pending = (async () => {
      let row = await read()
      // A new locked read after tip waits for the final writer's commit.
      if (beganOpen && (!nbaPregameOpen(game) || (row && Date.now() >= Date.parse(row.tipoff_at)))) {
        forget(game, resource)
        row = await read()
      }
      remember(game, resource, row)
      return row
    })()
    reading.set(key, pending)
  }
  try { return snapshot(game, structuredClone(await pending) as Stored<T> | null) }
  finally { if (reading.get(key) === pending) reading.delete(key) }
}

/** The database clock, cutoff and observation order decide which writer wins. */
export async function saveNbaPregameResearch<T>(game: PaintGame, resource: string, entry: { value: T; observedAt: string }): Promise<NbaPregameResearchSnapshot<T> | null> {
  validResource(resource)
  game = await getNbaOddsGame(game)
  const observed = Date.parse(entry.observedAt), tip = nbaGameStart(game)
  if (!nbaPregameOpen(game) || tip == null || !Number.isFinite(observed) || observed >= tip || observed > Date.now()) return readNbaPregameResearch<T>(game, resource)
  const hit = memory.get(cacheKey(game, resource))
  if (hit && hit.until > Date.now() && Date.parse(hit.row.observed_at) >= observed) return snapshot(game, structuredClone(hit.row) as Stored<T>)
  const key = `${cacheKey(game, resource)}:${entry.observedAt}`
  let pending = saving.get(key)
  if (!pending) {
    pending = (async () => {
      const { data, error } = await createAdminClient().rpc('capture_nba_pregame_research', {
        p_game_id: game.id, p_resource: resource, p_version: version, p_tipoff: new Date(tip).toISOString(),
        p_observed_at: entry.observedAt, p_payload: entry.value,
      }).abortSignal(AbortSignal.timeout(12_000))
      if (error) throw new Error('Pregame research could not be archived')
      // Do not promote a pre-tip response into a long-lived closed-game cache.
      if (nbaPregameOpen(game) && (!data || Date.now() < Date.parse((data as Stored<T>).tipoff_at))) remember(game, resource, data as Stored<T> | null)
      return data as Stored<T> | null
    })()
    saving.set(key, pending)
  }
  try {
    const row = structuredClone(await pending) as Stored<T> | null
    if (!nbaPregameOpen(game) || (row && Date.now() >= Date.parse(row.tipoff_at))) {
      forget(game, resource)
      return await readNbaPregameResearch<T>(game, resource)
    }
    return snapshot(game, row)
  }
  finally { if (saving.get(key) === pending) saving.delete(key) }
}

/** Closed games NEVER run a current-data loader, including when history is missing. */
export async function nbaPregameResearch<T>(game: PaintGame, resource: string, load: () => Promise<{ value: T; observedAt: string }>): Promise<NbaPregameResearchSnapshot<T>> {
  game = await getNbaOddsGame(game)
  const prior = await readNbaPregameResearch<T>(game, resource)
  if (prior?.frozen) return prior
  if (!nbaPregameOpen(game)) {
    const archived = prior
    if (!archived) throw new NbaPregameResearchUnavailable()
    return archived
  }
  try {
    const entry = await load()
    const archived = await saveNbaPregameResearch(game, resource, entry)
    if (!archived) throw new NbaPregameResearchUnavailable()
    return archived
  } catch (failure) {
    // A response may cross tip or a provider may fail. Only an already archived
    // observation can be returned; never relabel a late result as pregame.
    const archived = await readNbaPregameResearch<T>(game, resource)
    if (archived) return archived
    throw failure
  }
}
