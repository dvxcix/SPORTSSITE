import { gunzipSync } from 'node:zlib'

// The database independently applies this bound to the JSONB payload. Keep it
// on the expanded pool as well so a small compressed payload cannot allocate
// an arbitrarily large amount of memory in a research function.
const MAX_POOL_BYTES = 8 * 1024 * 1024
// Generous bounds are above the inspected 15-game pool (523 players, 45,936
// quotes, 2,079 logs), while bounding work on malformed compressed inputs.
const MAX_PLAYERS = 1024, MAX_QUOTES = 200_000, MAX_LOGS = 40_000
const MAX_PLAYER_QUOTES = 2048, MAX_PLAYER_LOGS = 256
export type NbaSlateGzipArchive = { version: 3; codec: 'gzip-base64'; uncompressedBytes: number; data: string; capturedTips: [number, string][] }

/** Decode an archived v3 slate envelope. Legacy v1/v2 pools pass through.
 * Only read compatibility is provided here: the writer still produces v2.
 */
export function decodeArchivedNbaSlatePool(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const envelope = value as Record<string, unknown>
  if (envelope.version !== 3) return value
  const keys = Object.keys(envelope).sort()
  if (keys.join(',') !== 'capturedTips,codec,data,uncompressedBytes,version'
    || envelope.codec !== 'gzip-base64'
    || typeof envelope.data !== 'string' || !envelope.data.length || envelope.data.length > MAX_POOL_BYTES
    || typeof envelope.uncompressedBytes !== 'number' || !Number.isSafeInteger(envelope.uncompressedBytes)
    || envelope.uncompressedBytes < 1 || envelope.uncompressedBytes > MAX_POOL_BYTES
    || !Array.isArray(envelope.capturedTips) || envelope.capturedTips.length < 1 || envelope.capturedTips.length > 16
    || !envelope.capturedTips.every(tip => Array.isArray(tip) && tip.length === 2
      && Number.isSafeInteger(tip[0]) && tip[0] > 0 && typeof tip[1] === 'string'
      && Number.isFinite(Date.parse(tip[1])) && new Date(Date.parse(tip[1])).toISOString() === tip[1])
    || new Set(envelope.capturedTips.map(tip => tip[0])).size !== envelope.capturedTips.length
    || Buffer.byteLength(JSON.stringify(envelope)) > MAX_POOL_BYTES
    || envelope.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.data)) {
    throw new Error('Invalid NBA slate archive envelope')
  }
  const compressed = Buffer.from(envelope.data, 'base64')
  if (compressed.toString('base64') !== envelope.data) throw new Error('Invalid NBA slate archive encoding')
  // maxOutputLength is enforced by zlib while expanding, rather than after an
  // unbounded decompression has already allocated memory.
  const expanded = gunzipSync(compressed, { maxOutputLength: envelope.uncompressedBytes })
  if (expanded.byteLength !== envelope.uncompressedBytes) throw new Error('Invalid NBA slate archive length')
  const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(expanded))
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)
    || (decoded as Record<string, unknown>).version !== 2) throw new Error('Invalid NBA slate archive payload')
  const pool = decoded as Record<string, unknown>
  const date = typeof pool.date === 'string' ? pool.date : ''
  const parsedDate = Date.parse(`${date}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate)
    || new Date(parsedDate).toISOString().slice(0, 10) !== date
    || (pool.period !== 0 && pool.period !== 1) || !Array.isArray(pool.gameIds)
    || pool.gameIds.length < 1 || pool.gameIds.length > 16
    || !pool.gameIds.every(id => Number.isSafeInteger(id) && id > 0)
    || new Set(pool.gameIds).size !== pool.gameIds.length || !Array.isArray(pool.players)
    || pool.players.length > MAX_PLAYERS) {
    throw new Error('Invalid NBA slate archive identity')
  }
  const gameIds = new Set(pool.gameIds)
  if (envelope.capturedTips.length !== pool.gameIds.length
    || !envelope.capturedTips.every(tip => gameIds.has(tip[0]))) throw new Error('Invalid NBA slate archive cutoff')
  const dictionary = pool.dictionary && typeof pool.dictionary === 'object' && !Array.isArray(pool.dictionary)
    ? pool.dictionary as Record<string, unknown> : null
  if (!dictionary || !Array.isArray(dictionary.vendors) || dictionary.vendors.length > 128
    || !dictionary.vendors.every(value => typeof value === 'string' && value.length <= 128)
    || !Array.isArray(dictionary.markets) || dictionary.markets.length > 128
    || !dictionary.markets.every(value => typeof value === 'string' && value.length <= 128)
    || !Array.isArray(dictionary.timestamps) || dictionary.timestamps.length > MAX_QUOTES
    || !dictionary.timestamps.every(value => typeof value === 'string' && value.length <= 64)) {
    throw new Error('Invalid NBA slate archive dictionary')
  }
  const players = new Set<string>()
  let quotes = 0, logs = 0
  for (const value of pool.players) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid NBA slate archive identity')
    const player = value as Record<string, unknown>
    if (!Number.isSafeInteger(player.id) || (player.id as number) < 1
      || !Number.isSafeInteger(player.gameId) || !gameIds.has(player.gameId)
      || !player.average || typeof player.average !== 'object' || Array.isArray(player.average)
      || Object.keys(player.average).length > 256
      || !Object.entries(player.average).every(([key, value]) => key.length <= 128 && (value === null || typeof value === 'number' && Number.isFinite(value)))
      || !Array.isArray(player.logs) || player.logs.length > MAX_PLAYER_LOGS
      || !Array.isArray(player.props) || player.props.length > MAX_PLAYER_QUOTES) throw new Error('Invalid NBA slate archive identity')
    quotes += player.props.length; logs += player.logs.length
    if (quotes > MAX_QUOTES || logs > MAX_LOGS) throw new Error('NBA slate archive exceeds cardinality limit')
    if (!player.props.every(quote => Array.isArray(quote) && quote.length === 8 && typeof quote[2] === 'string' && quote[2].length <= 64)) {
      throw new Error('Invalid NBA slate archive quote')
    }
    for (const log of player.logs) {
      const logDate = Array.isArray(log) && typeof log[2] === 'string' ? log[2].slice(0, 10) : ''
      const parsedLogDate = Date.parse(`${logDate}T00:00:00.000Z`)
      if (!Array.isArray(log) || log.length !== 24
        || !Number.isSafeInteger(log[0]) || log[0] <= 0 || !Number.isSafeInteger(log[1]) || log[1] <= 0
        || log[1] === player.gameId || typeof log[2] !== 'string' || !Number.isFinite(Date.parse(log[2]))
        || !/^\d{4}-\d{2}-\d{2}$/.test(logDate) || !Number.isFinite(parsedLogDate)
        || new Date(parsedLogDate).toISOString().slice(0, 10) !== logDate || logDate >= date
        || ![log[3], log[4], log[5]].every(id => Number.isSafeInteger(id) && id > 0)
        || !(log[6] === null || Number.isSafeInteger(log[6])) || !(log[7] === null || typeof log[7] === 'boolean')
        || typeof log[8] !== 'string' || !(log[9] === null || typeof log[9] === 'string')
        || typeof log[10] !== 'string' || !(log[11] === null || Number.isSafeInteger(log[11]))
        || !log.slice(12).every(stat => stat === null || typeof stat === 'number' && Number.isFinite(stat))) {
        throw new Error('Invalid NBA slate archive history')
      }
    }
    // Rankings and model lookup are keyed by player ID across the pool. A
    // duplicate on another game would otherwise silently borrow that game's
    // inputs even though each individual game/player pair was unique.
    const key = String(player.id)
    if (players.has(key)) throw new Error('Invalid NBA slate archive identity')
    players.add(key)
  }
  return decoded
}
