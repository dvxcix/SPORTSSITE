import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { WATCHLIST_SHARE_PAGE_SIZE } from '../src/lib/watchlistSharePages'

const require = createRequire(import.meta.url)
const rows = Array.from({ length: WATCHLIST_SHARE_PAGE_SIZE }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  sport: 'NBA', player_name: `Player ${i}`, team: null, prop_label: '20+ Points', odds_by_book: {},
}))
Object.assign(globalThis, { watchlistShareFixture: rows })
const stubs: Record<string, string> = {
  '@/lib/nbaPaint': 'export const nbaTeamLogo=()=>null',
  '@/lib/mlbViewerAccess': 'export const canViewMlb=async()=>false',
  '@slipsurge/core/mlbTeamColors': 'export const getTeamLogoUrl=()=>null',
  '@/lib/supabase/server': `export const createClient=async()=>({ auth:{getUser:async()=>({data:{user:{id:'fixture'}}})}, from(table){const q={select(){return q},eq(){return q},single:async()=>({data:{username:'fixture'}}),in:async()=>({data:globalThis.watchlistShareFixture,error:null})};return q} })`,
}
const bundle = await build({
  stdin: { contents: 'export {GET} from "./src/app/api/share-image/watchlist/route"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'next/og'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { GET: (request: Request) => Promise<Response> } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)

test('a full page generates an actual bounded PNG without external requests', async () => {
  const icon = await readFile('public/icon-512.png')
  const oldFetch = globalThis.fetch
  globalThis.fetch = async input => {
    assert.equal(String(input), 'https://www.slipsurge.com/icon-512.png')
    return new Response(icon, { headers: { 'content-type': 'image/png' } })
  }
  try {
    const url = `https://www.slipsurge.com/api/share-image/watchlist?ids=${rows.map(row => row.id).join(',')}`
    const result = await compiled.exports.GET(new Request(url))
    assert.equal(result.status, 200)
    const png = Buffer.from(await result.arrayBuffer())
    assert.equal(png.readUInt32BE(16), 720)
    assert.equal(png.readUInt32BE(20), 924)
    assert.equal(result.headers.get('cache-control'), 'private, no-store')
  } finally { globalThis.fetch = oldFetch }
})
