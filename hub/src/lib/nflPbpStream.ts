import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rmdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

// Bound disk, heap, decompression and malformed input independently. The
// compressed spool is removed even on failure; only it is written to disk.
const MAX_COMPRESSED = 128 * 1024 * 1024
const MAX_UNCOMPRESSED = 512 * 1024 * 1024
const MAX_RECORD_CHARS = 256 * 1024
const MAX_COLUMNS = 1024
const MAX_ROWS = 250_000

async function* records(path: string): AsyncGenerator<string[]> {
  const input = createReadStream(path), gunzip = createGunzip()
  input.on('error', error => gunzip.destroy(error))
  input.pipe(gunzip)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0, recordChars = 0, fields: string[] = [], field = '', state: 'start' | 'plain' | 'quoted' | 'after' = 'start', skipLf = false, started = false
  const finishField = () => { fields.push(field); field = ''; if (fields.length > MAX_COLUMNS) throw new Error('NFL PBP CSV has too many columns') }
  const consume = function* (text: string): Generator<string[]> {
    for (const c of text) {
      if (skipLf) { skipLf = false; if (c === '\n') continue }
      if (++recordChars > MAX_RECORD_CHARS) throw new Error('NFL PBP CSV record is too large')
      if (state === 'quoted') {
        if (c === '"') state = 'after'; else field += c
        continue
      }
      if (state === 'after' && c === '"') { field += '"'; state = 'quoted'; continue }
      if (c === ',') { finishField(); state = 'start'; started = true; continue }
      if (c === '\n' || c === '\r') {
        if (started || field || fields.length || state !== 'start') {
          finishField(); yield fields; fields = []; field = ''; started = false
        }
        recordChars = 0; state = 'start'; skipLf = c === '\r'; continue
      }
      if (state === 'after') throw new Error('NFL PBP CSV has invalid quote')
      if (c === '"') { if (state !== 'start') throw new Error('NFL PBP CSV has invalid quote'); state = 'quoted'; started = true; continue }
      field += c; state = 'plain'; started = true
    }
  }
  try {
    for await (const chunk of gunzip) {
      const data = chunk as Buffer
      bytes += data.length
      if (bytes > MAX_UNCOMPRESSED) throw new Error('NFL PBP CSV is too large')
      yield* consume(decoder.decode(data, { stream: true }))
    }
    yield* consume(decoder.decode())
    if ((state as string) === 'quoted') throw new Error('NFL PBP CSV has an unterminated quote')
    if (started || field || fields.length || state !== 'start') { finishField(); yield fields }
  } finally { input.destroy(); gunzip.destroy() }
}

async function* rows(path: string, requiredColumns: readonly string[]): AsyncGenerator<Record<string, string>> {
  let header: string[] | undefined, count = 0
  for await (const values of records(path)) {
    if (!header) {
      values[0] = values[0]?.replace(/^\uFEFF/, '')
      if (requiredColumns.some(name => !values.includes(name)) || new Set(values).size !== values.length || values.some(value => !value || value === '__proto__')) throw new Error('NFL PBP CSV header is invalid')
      header = values; continue
    }
    if (++count > MAX_ROWS || values.length !== header.length) throw new Error('NFL PBP CSV row is invalid')
    const row: Record<string, string> = {}
    header.forEach((name, i) => { row[name] = values[i] })
    yield row
  }
  if (!header || count === 0) throw new Error('NFL PBP CSV is empty')
}

/**
 * Complete and validate the gzip and CSV before exposing any source row to a
 * writer. A second pass bounds memory while retaining all source fields.
 */
export async function withValidatedNflPbp<T>(
  body: ReadableStream<Uint8Array>,
  requiredColumns: readonly string[],
  validateRow: (row: Record<string, string>) => boolean,
  run: (rows: AsyncIterable<Record<string, string>>) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'slipsurge-pbp-')), path = join(directory, 'source.gz')
  try {
    const reader = body.getReader()
    const source = Readable.from((async function* () {
      let total = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          total += next.value.byteLength
          if (total > MAX_COMPRESSED) throw new Error('NFL PBP gzip is too large')
          yield next.value
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    })())
    await pipeline(source, createWriteStream(path, { flags: 'wx' }))
    // Decompression to EOF verifies gzip checksums and the entire CSV before
    // the first DB mutation. The second pass reads the same private file.
    let validIdentities = 0
    for await (const row of rows(path, requiredColumns)) if (validateRow(row)) validIdentities++
    if (!validIdentities) throw new Error('NFL PBP CSV has no valid play identities')
    return await run(rows(path, requiredColumns))
  } finally {
    await unlink(path).catch(error => { if (error?.code !== 'ENOENT') throw error })
    await rmdir(directory)
  }
}
