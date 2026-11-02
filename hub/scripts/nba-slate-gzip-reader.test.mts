import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { decodeArchivedNbaSlatePool } from '../src/lib/nbaSlatePoolCodec.ts'

const encoded = (value: unknown) => {
  const bytes = Buffer.from(JSON.stringify(value))
  const ids = value && typeof value === 'object' && 'gameIds' in value && Array.isArray(value.gameIds) ? value.gameIds : [1]
  return { version: 3, codec: 'gzip-base64', uncompressedBytes: bytes.length, data: gzipSync(bytes).toString('base64'), capturedTips: ids.map(id => [id, '2026-11-03T01:00:00.000Z']) }
}
const pool = { version: 2, date: '2026-11-02', gameIds: [1, 2], period: 0,
  dictionary: { vendors: ['book'], markets: ['points'], timestamps: ['2026-11-02T18:00:00Z'] },
  players: [{ id: 100, gameId: 1, average: { pts: 15 }, logs: [], props: [[0, 0, '20', 0, 150, null, null, 0]] }] }

test('legacy pool values remain unchanged and v3 losslessly restores the v2 contents', () => {
  const v1 = { version: 1, date: '2026-11-02', gameIds: [1], period: 0, players: [] }
  assert.equal(decodeArchivedNbaSlatePool(v1), v1)
  assert.equal(decodeArchivedNbaSlatePool(pool), pool)
  assert.deepEqual(decodeArchivedNbaSlatePool(encoded(pool)), pool)
})

test('bad envelopes and compressed data are rejected rather than treated as valid history', () => {
  const good = encoded(pool)
  for (const bad of [
    { ...good, codec: 'other' }, { ...good, extra: 1 }, { ...good, data: good.data + '!' },
    { ...good, data: good.data.slice(0, -4) }, { ...good, uncompressedBytes: good.uncompressedBytes + 1 },
    { ...good, uncompressedBytes: 0 }, { ...good, uncompressedBytes: 8 * 1024 * 1024 + 1 },
    { ...good, data: Buffer.from('not gzip').toString('base64') }, { ...good, capturedTips: [] },
    { ...good, capturedTips: [[1, '2026-11-03']] }, { ...good, capturedTips: [[1, '2026-11-03T01:00:00.000Z']] }, encoded({ version: 1 }),
  ]) assert.throws(() => decodeArchivedNbaSlatePool(bad))
})

test('decompression is bounded before allocating an oversized expanded pool', () => {
  const bomb = Buffer.alloc(8 * 1024 * 1024 + 1, 65)
  const envelope = { version: 3, codec: 'gzip-base64', uncompressedBytes: 8 * 1024 * 1024, data: gzipSync(bomb).toString('base64'), capturedTips: [[1, '2026-11-03T01:00:00.000Z']] }
  assert.throws(() => decodeArchivedNbaSlatePool(envelope))
})

test('invalid UTF-8 cannot be silently converted into different archived data', () => {
  const bytes = Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d])
  assert.throws(() => decodeArchivedNbaSlatePool({ version: 3, codec: 'gzip-base64', uncompressedBytes: bytes.length, data: gzipSync(bytes).toString('base64'), capturedTips: [[1, '2026-11-03T01:00:00.000Z']] }))
})

test('compressed history rejects malformed dates and mismatched player/game identities', () => {
  const badDate = structuredClone(pool); badDate.date = '2026-02-30'
  const duplicateGame = structuredClone(pool); duplicateGame.gameIds = [1, 1]
  const wrongGame = structuredClone(pool); wrongGame.players[0].gameId = 3
  const duplicatePlayer = structuredClone(pool); duplicatePlayer.players.push(structuredClone(duplicatePlayer.players[0]))
  const otherGameDuplicate = structuredClone(pool); otherGameDuplicate.players.push({ ...structuredClone(otherGameDuplicate.players[0]), gameId: 2 })
  const badPlayer = structuredClone(pool); badPlayer.players[0].id = 0
  const nullAverage = structuredClone(pool); (nullAverage.players[0] as { average: unknown }).average = null
  const malformedLog = structuredClone(pool); (malformedLog.players[0] as { logs: unknown[] }).logs = [{}]
  const log = [5, 99, '2026-10-01', 1, 1, 2, 2026, false, 'Final', 'final', '30', 0, ...Array(12).fill(1)]
  const sameGameLog = structuredClone(pool); (sameGameLog.players[0] as { logs: unknown[] }).logs = [[...log.slice(0, 1), 1, ...log.slice(2)]]
  const invalidDateLog = structuredClone(pool); (invalidDateLog.players[0] as { logs: unknown[] }).logs = [[...log.slice(0, 2), '2026-02-30', ...log.slice(3)]]
  for (const bad of [badDate, duplicateGame, wrongGame, duplicatePlayer, otherGameDuplicate, badPlayer, nullAverage, malformedLog, sameGameLog, invalidDateLog]) {
    assert.throws(() => decodeArchivedNbaSlatePool(encoded(bad)))
  }
})

test('v3 bounds player, quote, log and dictionary work before frozen ranking', () => {
  const extraPlayers = structuredClone(pool)
  extraPlayers.players = Array.from({ length: 1025 }, (_, index) => ({ ...structuredClone(pool.players[0]), id: index + 1 }))
  const extraQuotes = structuredClone(pool)
  extraQuotes.players[0].props = Array.from({ length: 2049 }, () => [...pool.players[0].props[0]])
  const extraLogs = structuredClone(pool)
  ;(extraLogs.players[0] as { logs: unknown[] }).logs = Array.from({ length: 257 }, () => [])
  const extraVendors = structuredClone(pool); extraVendors.dictionary.vendors = Array.from({ length: 129 }, (_, index) => `book${index}`)
  const hugeLine = structuredClone(pool); hugeLine.players[0].props[0][2] = '1'.repeat(65)
  for (const bad of [extraPlayers, extraQuotes, extraLogs, extraVendors, hugeLine]) assert.throws(() => decodeArchivedNbaSlatePool(encoded(bad)))
})

test('v3 rejects a pool exceeding the aggregate quote budget even when each player is within their cap', () => {
  const quote = pool.players[0].props[0]
  const many = structuredClone(pool)
  many.players = Array.from({ length: 101 }, (_, index) => ({ ...structuredClone(pool.players[0]), id: index + 1, props: Array.from({ length: 1981 }, () => [...quote]) }))
  assert.throws(() => decodeArchivedNbaSlatePool(encoded(many)))
})
