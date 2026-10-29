import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { NFL_PBP_REQUIRED_COLUMNS, isNflverseAssetError, syncNflPbp } from '../src/lib/nflverseSync'

const columns = [...NFL_PBP_REQUIRED_COLUMNS, 'extra']
const quote = (s: string) => /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
const line = (row: Record<string, string>) => columns.map(column => quote(row[column] ?? '')).join(',')
const csv = (records: Record<string, string>[]) => [columns.join(','), ...records.map(line)].join('\r\n') + '\r\n'
const play = (id: number, changes: Record<string, string> = {}): Record<string, string> => ({ game_id: 'game', play_id: String(id), season: '2026', desc: 'play', passing_yards: '2', touchdown: '0', extra: 'value', ...changes })
const tempFiles = async () => (await readdir(tmpdir())).filter(name => name.startsWith('slipsurge-pbp-')).sort()
function fixture(bytes: Uint8Array, size = 19) {
  let offset = 0
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close()
      controller.enqueue(bytes.subarray(offset, offset + size)); offset += size
    },
  }), { status: 200 })
}
function database(failAt = 0) {
  const saved = new Map<string, Record<string, unknown>>(), calls: number[] = [], sizes: number[] = []
  const admin = { from: (table: string) => ({ upsert: async (rows: Record<string, unknown>[], options: { onConflict: string }) => {
    assert.equal(table, 'nfl_pbp'); assert.equal(options.onConflict, 'game_id,play_id')
    calls.push(rows.length)
    sizes.push(Buffer.byteLength(JSON.stringify(rows)))
    if (failAt === calls.length) return { error: new Error('write failed') }
    assert.equal(new Set(rows.map(row => `${row.game_id}|${row.play_id}`)).size, rows.length)
    for (const row of rows) saved.set(`${row.game_id}|${row.play_id}`, row)
    return { error: null }
  } }) }
  return { admin, calls, sizes, saved }
}

test('bounded ingestion preserves all fields, typed values and last duplicate across batches', async t => {
  const initial = await tempFiles()
  const values = Array.from({ length: 502 }, (_, i) => play(i + 1))
  values.splice(1, 0, play(1, { desc: 'within', passing_yards: '3', touchdown: '1', extra: 'within' }))
  const corrected = play(1, { desc: 'new "quoted",\nline', passing_yards: '7', touchdown: '1', extra: 'hello, world' })
  values.push(corrected)
  const data = gzipSync(csv(values)), db = database()
  t.mock.method(globalThis, 'fetch', async () => fixture(data) as never)
  const count = await syncNflPbp(db.admin as never, 2026)
  assert.equal(count, 502)
  assert.ok(db.calls.length > 1); assert.ok(db.sizes.every(size => size <= 6 * 1024 * 1024))
  const row = db.saved.get('game|1')!
  assert.equal(row.play_desc, 'new "quoted",\nline')
  assert.equal(row.passing_yards, 7); assert.equal(row.touchdown, true); assert.equal(row.season, 2026)
  assert.deepEqual(row.raw, Object.fromEntries(columns.map(column => [column, corrected[column] ?? ''])))
  assert.deepEqual(await tempFiles(), initial)
})

test('truncated gzip and malformed CSV fail before the first database write and clean up', async t => {
  const initial = await tempFiles()
  const valid = gzipSync(csv([play(1)]))
  const fixtures = [valid.subarray(0, valid.length - 5), gzipSync(columns.join(',') + '\r\n"unterminated'), gzipSync(columns.join(',') + '\r\ngame,short'), gzipSync(csv([play(1, { season: '2025' })])), gzipSync(csv([play(1, { game_id: '' })])), gzipSync(columns.slice(1).join(',') + '\r\n' + columns.slice(1).map(column => quote(play(1)[column] ?? '')).join(','))]
  for (const data of fixtures) {
    const db = database()
    const replacement = t.mock.method(globalThis, 'fetch', async () => fixture(data) as never)
    await assert.rejects(syncNflPbp(db.admin as never, 2026))
    replacement.mock.restore()
    assert.deepEqual(db.calls, [])
  }
  assert.deepEqual(await tempFiles(), initial)
})

test('a database failure propagates after a partial write and removes the temporary source', async t => {
  const initial = await tempFiles(), db = database(2)
  const values = Array.from({ length: 501 }, (_, i) => play(i + 1))
  t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync(csv(values))) as never)
  await assert.rejects(syncNflPbp(db.admin as never, 2026), /write failed/)
  assert.equal(db.calls.length, 2); assert.equal(db.saved.size, db.calls[0])
  assert.deepEqual(await tempFiles(), initial)
})

test('a broken download fails without writes and removes temporary files', async t => {
  const initial = await tempFiles(), db = database()
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1, 2])); c.error(new Error('download interrupted')) } })
  t.mock.method(globalThis, 'fetch', async () => new Response(stream, { status: 200 }) as never)
  await assert.rejects(syncNflPbp(db.admin as never, 2026), /download interrupted/)
  assert.deepEqual(db.calls, []); assert.deepEqual(await tempFiles(), initial)
})

test('an unpublished source retains the existing typed 404 behavior', async t => {
  const db = database()
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }) as never)
  await assert.rejects(syncNflPbp(db.admin as never, 2026), error => isNflverseAssetError(error, 404))
  assert.deepEqual(db.calls, [])
})

test('malformed UTF-8 fails closed before writing', async t => {
  const db = database()
  const broken = Buffer.concat([Buffer.from(columns.join(',') + '\r\n'), Buffer.from([0xff]), Buffer.from('\r\n')])
  t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync(broken)) as never)
  await assert.rejects(syncNflPbp(db.admin as never, 2026))
  assert.deepEqual(db.calls, [])
})

test('a syntactically valid shorter source cannot establish logical completeness', async t => {
  // Gzip integrity and a complete schema do not prove upstream published every
  // play. Existing behavior upserts present rows without deleting absent ones.
  const db = database()
  t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync(csv([play(1)]))) as never)
  assert.equal(await syncNflPbp(db.admin as never, 2026), 1)
  assert.deepEqual(db.calls, [1])
})

test('large rows flush by payload bytes and oversized records fail before any write', async t => {
  const db = database()
  const normal = Array.from({ length: 150 }, (_, i) => play(i + 1, { extra: 'x'.repeat(50_000) }))
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync(csv(normal))) as never)
  assert.equal(await syncNflPbp(db.admin as never, 2026), 150)
  assert.ok(db.calls.length > 1)
  assert.ok(db.sizes.every(size => size <= 6 * 1024 * 1024))
  fetchMock.mock.restore()
  const rejected = database()
  t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync(csv([play(1), play(2, { extra: 'x'.repeat(300_000) })]))) as never)
  await assert.rejects(syncNflPbp(rejected.admin as never, 2026), /record is too large/)
  assert.deepEqual(rejected.calls, [])
  const mapped = database()
  const nextMock = t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync(csv([play(1), play(2, { extra: '\u0001'.repeat(100_000) })]))) as never)
  await assert.rejects(syncNflPbp(mapped.admin as never, 2026), /mapped row is too large/)
  nextMock.mock.restore()
  assert.deepEqual(mapped.calls, [])
  const longId = database()
  t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync(csv([play(1), play(2, { game_id: 'g'.repeat(129) })]))) as never)
  await assert.rejects(syncNflPbp(longId.admin as never, 2026), /identity is too large/)
  assert.deepEqual(longId.calls, [])
})

test('earlier seasons retain their existing import behavior', async t => {
  const db = database()
  t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync('game_id,play_id,season,desc\ngame,1,2025,old\n')) as never)
  assert.equal(await syncNflPbp(db.admin as never, 2025), 1)
  assert.equal(db.saved.get('game|1')?.play_desc, 'old')
})

test('later seasons use bounded validation and reject removed baseline columns', async t => {
  const db = database()
  const m = t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync(csv([play(1, { season: '2027' })]))) as never)
  assert.equal(await syncNflPbp(db.admin as never, 2027), 1)
  m.mock.restore()
  const bad = database()
  t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync(columns.slice(1).join(',') + '\r\n' + columns.slice(1).map(column => quote(play(1, { season: '2027' })[column] ?? '')).join(','))) as never)
  await assert.rejects(syncNflPbp(bad.admin as never, 2027), /header is invalid/)
  assert.deepEqual(bad.calls, [])
})

test('untrusted extra columns cannot alter prototype or vanish silently', async t => {
  const db = database()
  const malformed = columns.join(',') + ',__proto__\r\n' + line(play(1)) + ',value\r\n'
  t.mock.method(globalThis, 'fetch', async () => fixture(gzipSync(malformed)) as never)
  await assert.rejects(syncNflPbp(db.admin as never, 2026), /header is invalid/)
  assert.deepEqual(db.calls, [])
})
