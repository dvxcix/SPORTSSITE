import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'
import { WATCHLIST_SHARE_PAGE_SIZE, watchlistSharePage } from '../src/lib/watchlistSharePages'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const shareFixture = { userId: 'account-a', upload: null as null | Promise<{ publicUrl: string }>, expectedOwner: '', inserted: 0 }
Object.assign(globalThis, { watchlistShareAuthFixture: shareFixture })
const stubs: Record<string, string> = {
  'next/navigation': 'export const useRouter=()=>({push(){},refresh(){}})',
  '@/lib/supabase/client': 'export const createClient=()=>({auth:{getUser:async()=>({data:{user:{id:globalThis.watchlistShareAuthFixture.userId}},error:null})},from:()=>({insert:()=>{globalThis.watchlistShareAuthFixture.inserted++;return {select:()=>({single:async()=>({data:{id:"fixture"}})})}}})})',
  '@/context/AuthContext': 'export const useAuth=()=>({user:{id:globalThis.watchlistShareAuthFixture.userId},loading:false,authUnavailable:false})',
  '@/lib/uploadMedia': 'export const uploadMedia=async(_file,_kind,owner)=>{globalThis.watchlistShareAuthFixture.expectedOwner=owner;return await globalThis.watchlistShareAuthFixture.upload}',
  '@/components/ui/ModalSurface': 'import React from "react"; export const ModalSurface=({children})=>React.createElement("div",null,children)',
  '@/components/ui/SafeImage': 'import React from "react"; export const SafeImage=(props)=>React.createElement("img",props)',
  'lucide-react': 'export const X=()=>null, Download=()=>null, Copy=()=>null, Check=()=>null, Share=()=>null, Send=()=>null',
}
const bundle = await build({
  stdin: { contents: 'export {ShareWatchlistModal} from "./src/components/dugout/ShareWatchlistModal"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs || args.path.endsWith('.module.css') ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] ?? 'export default {}', loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { ShareWatchlistModal: ComponentType<{ onClose: () => void; sport: 'NBA'; itemIds: string[] }> } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)

test('all selections remain in order across bounded image pages', () => {
  const items = Array.from({ length: 100 }, (_, i) => i)
  const pages = Array.from({ length: Math.ceil(items.length / WATCHLIST_SHARE_PAGE_SIZE) }, (_, i) => watchlistSharePage(items, i))
  assert.deepEqual(pages.flat(), items)
  assert.ok(pages.every(page => page.length <= WATCHLIST_SHARE_PAGE_SIZE))
  assert.deepEqual(watchlistSharePage(items, -1), [])
})

test('the image endpoint rejects oversized pages before reading an account', async () => {
  const routeStubs: Record<string, string> = {
    'next/og': 'export class ImageResponse {}',
    '@/lib/nbaPaint': 'export const nbaTeamLogo=()=>null',
    '@/lib/mlbViewerAccess': 'export const canViewMlb=async()=>false',
    '@/lib/supabase/server': 'export const createClient=()=>{throw new Error("unexpected account read")}',
    '@slipsurge/core/mlbTeamColors': 'export const getTeamLogoUrl=()=>null',
  }
  const routeBundle = await build({
    stdin: { contents: 'export {GET} from "./src/app/api/share-image/watchlist/route"', resolveDir: resolve('.'), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react'], tsconfig: 'tsconfig.json',
    plugins: [{ name: 'route-fixture', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in routeStubs ? { path: args.path, namespace: 'fixture' } : undefined)
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: routeStubs[args.path], loader: 'tsx' }))
    } }],
  })
  const route = { exports: {} as { GET: (request: Request) => Promise<Response> } }
  new Function('require', 'module', 'exports', routeBundle.outputFiles[0].text)(require, route, route.exports)
  const ids = Array.from({ length: WATCHLIST_SHARE_PAGE_SIZE + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
  const response = await route.exports.GET(new Request(`https://www.slipsurge.com/api/share-image/watchlist?ids=${ids.join(',')}`))
  assert.equal(response.status, 400)
})

test('each image page is requested once and its preview and download use the same bytes', async () => {
  const items = Array.from({ length: 25 }, (_, i) => `selection-${i}`)
  const requests: string[] = []
  const revoked: string[] = []
  const oldFetch = globalThis.fetch, oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL
  const oldClick = dom.window.HTMLAnchorElement.prototype.click
  globalThis.fetch = async input => { requests.push(String(input)); return new Response('image', { headers: { 'content-type': 'image/png' } }) }
  let serial = 0
  URL.createObjectURL = () => `blob:fixture-${++serial}`
  URL.revokeObjectURL = url => { revoked.push(url) }
  dom.window.HTMLAnchorElement.prototype.click = () => {}
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.includes(name))!
  try {
    await act(async () => { root.render(createElement(compiled.exports.ShareWatchlistModal, { onClose() {}, sport: 'NBA', itemIds: items })); await new Promise(done => setTimeout(done, 0)) })
    assert.match(host.textContent ?? '', /Page 1 of 3/)
    assert.equal(requests.length, 1)
    assert.deepEqual(new URL(requests[0], 'https://www.slipsurge.com').searchParams.get('ids')?.split(','), items.slice(0, 12))
    await act(async () => { button('Download').click(); await new Promise(done => setTimeout(done, 0)) })
    assert.equal(requests.length, 1, 'download should reuse the preview rather than render again')
    await act(async () => { button('Next').click(); await new Promise(done => setTimeout(done, 0)) })
    assert.match(host.textContent ?? '', /Page 2 of 3/)
    assert.deepEqual(new URL(requests[1], 'https://www.slipsurge.com').searchParams.get('ids')?.split(','), items.slice(12, 24))
    await act(async () => { button('Next').click(); await new Promise(done => setTimeout(done, 0)) })
    assert.match(host.textContent ?? '', /Page 3 of 3/)
    assert.deepEqual(new URL(requests[2], 'https://www.slipsurge.com').searchParams.get('ids')?.split(','), items.slice(24))
  } finally {
    await act(async () => root.unmount()); host.remove()
    globalThis.fetch = oldFetch; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke
    dom.window.HTMLAnchorElement.prototype.click = oldClick
  }
  assert.ok(revoked.includes('blob:fixture-1'))
})

test('a late response from the previous page cannot replace the current page', async () => {
  const items = Array.from({ length: 13 }, (_, i) => `selection-${i}`)
  const oldFetch = globalThis.fetch, oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL
  let finishFirst!: (value: Response) => void
  let count = 0
  globalThis.fetch = async () => {
    count++
    return count === 1 ? new Promise<Response>(done => { finishFirst = done }) : new Response('second', { headers: { 'content-type': 'image/png' } })
  }
  URL.createObjectURL = () => 'blob:current'
  URL.revokeObjectURL = () => {}
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(compiled.exports.ShareWatchlistModal, { onClose() {}, sport: 'NBA', itemIds: items })) })
    await act(async () => { [...host.querySelectorAll('button')].find(item => item.textContent === 'Next')!.click(); await new Promise(done => setTimeout(done, 0)) })
    assert.equal(host.querySelector('img')?.getAttribute('src'), 'blob:current')
    await act(async () => { finishFirst(new Response('first', { headers: { 'content-type': 'image/png' } })); await new Promise(done => setTimeout(done, 0)) })
    assert.equal(host.querySelector('img')?.getAttribute('src'), 'blob:current')
    assert.match(host.textContent ?? '', /Page 2 of 2/)
  } finally {
    await act(async () => root.unmount()); host.remove()
    globalThis.fetch = oldFetch; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke
  }
})

test('account switch hides the previous preview and prevents a delayed post', async () => {
  const oldFetch = globalThis.fetch, oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL
  const oldFile = globalThis.File
  globalThis.File = dom.window.File
  globalThis.fetch = async () => new Response('image', { headers: { 'content-type': 'image/png' } })
  URL.createObjectURL = () => 'blob:account-a'; URL.revokeObjectURL = () => {}
  let finishUpload!: (value: { publicUrl: string }) => void
  shareFixture.userId = 'account-a'; shareFixture.inserted = 0; shareFixture.expectedOwner = ''
  shareFixture.upload = new Promise(done => { finishUpload = done })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const props = { onClose() {}, sport: 'NBA' as const, itemIds: ['selection'] }
  try {
    await act(async () => { root.render(createElement(compiled.exports.ShareWatchlistModal, props)); await new Promise(done => setTimeout(done, 0)) })
    assert.equal(host.querySelector('img')?.getAttribute('src'), 'blob:account-a')
    await act(async () => { [...host.querySelectorAll('button')].find(item => item.textContent?.includes('Post to feed'))!.click(); await new Promise(done => setTimeout(done, 0)) })
    assert.equal(shareFixture.expectedOwner, 'account-a')
    shareFixture.userId = 'account-b'
    await act(async () => { root.render(createElement(compiled.exports.ShareWatchlistModal, props)) })
    assert.equal(host.querySelector('img'), null)
    assert.match(host.textContent ?? '', /account changed/)
    await act(async () => { finishUpload({ publicUrl: 'https://example.invalid/image.png' }); await new Promise(done => setTimeout(done, 0)) })
    assert.equal(shareFixture.inserted, 0)
  } finally {
    await act(async () => root.unmount()); host.remove()
    globalThis.fetch = oldFetch; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; globalThis.File = oldFile
    shareFixture.userId = 'account-a'; shareFixture.upload = null
  }
})

test('server rejects an upload if the authenticated account changed', async () => {
  const routeStubs: Record<string, string> = {
    'next/server': 'export const NextResponse={json:(data,init)=>Response.json(data,init)}',
    'sharp': 'export default ()=>{throw new Error("unexpected image processing")}',
    '@/lib/supabase/server': 'export const createClient=async()=>({auth:{getUser:async()=>({data:{user:{id:"account-b"}}})}})',
    '@/lib/supabase/admin': 'export const createAdminClient=()=>{throw new Error("unexpected storage access")}',
    '@/lib/serverRateLimit': 'export const consumeServerRateLimit=()=>{throw new Error("unexpected rate check")}',
    '@/lib/safeApiError': 'export const safeApiError=()=>{throw new Error("unexpected")}',
  }
  const routeBundle = await build({
    stdin: { contents: 'export {POST} from "./src/app/api/upload/route"', resolveDir: resolve('.'), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', tsconfig: 'tsconfig.json',
    plugins: [{ name: 'upload-fixture', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in routeStubs ? { path: args.path, namespace: 'fixture' } : undefined)
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: routeStubs[args.path], loader: 'ts' }))
    } }],
  })
  const route = { exports: {} as { POST: (request: Request) => Promise<Response> } }
  new Function('require', 'module', 'exports', routeBundle.outputFiles[0].text)(require, route, route.exports)
  const form = new FormData(); form.append('expectedUserId', 'account-a'); form.append('kind', 'posts')
  const response = await route.exports.POST(new Request('https://www.slipsurge.com/api/upload', { method: 'POST', body: form }))
  assert.equal(response.status, 409)
})
