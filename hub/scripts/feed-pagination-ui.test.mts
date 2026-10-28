import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/feed' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
class Observer {
  static latest: Observer
  disconnected = false
  constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) { Observer.latest = this }
  observe() {}
  disconnect() { this.disconnected = true }
  fire() { if (!this.disconnected) this.callback([{ isIntersecting: true }]) }
}
Object.assign(globalThis, { IntersectionObserver: Observer })
const auth = { user: null as { id: string } | null, loading: false, authUnavailable: false }
let refreshes = 0
const router = { refresh: () => { refreshes++ } }
Object.assign(globalThis, { feedAuthFixture: auth, feedRouterFixture: router })
const stubs: Record<string, string> = {
  './PostCardClient': 'import React from "react"; export const PostCardClient=({post})=>React.createElement("article",null,post.id)',
  '@/components/ui/feedback-state': 'export const SkeletonBlock=()=>null',
  '@/context/AuthContext': 'export const useAuth=()=>globalThis.feedAuthFixture',
  'next/navigation': 'export const useRouter=()=>globalThis.feedRouterFixture',
}
const bundle = await build({
  stdin: { contents: 'export {FeedList} from "./src/components/social/FeedList";export {ProfilePostList} from "./src/components/social/ProfilePostList"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'feed-ui-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { FeedList: ComponentType<Record<string, unknown>>; ProfilePostList: ComponentType<Record<string, unknown>> } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)

for (const kind of ['feed', 'profile'] as const) {
  test(`${kind} loads later matches after an empty filtered page and preserves retry on failure`, async () => {
    const originalFetch = globalThis.fetch
    const requests: string[] = []
    const replies = [
      Response.json({ posts: [], nextCursor: 'next', hasMore: true }),
      new Response(null, { status: 503 }),
      Response.json({ posts: [{ id: 'later' }], nextCursor: null, hasMore: false }),
    ]
    globalThis.fetch = async input => { requests.push(String(input)); return replies.shift()! }
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
    Object.assign(auth, { user: null, loading: false, authUnavailable: false }); refreshes = 0
    const common = { initialPosts: [], initialCursor: 'first', initialHasMore: true, viewerId: null }
    const props = kind === 'feed' ? { ...common, filter: 'latest' } : { ...common, userId: 'owner', tab: 'all' }
    try {
      await act(async () => root.render(createElement(kind === 'feed' ? compiled.exports.FeedList : compiled.exports.ProfilePostList, props)))
      await act(async () => Observer.latest.fire())
      assert.equal(requests.length, 1)
      assert.ok(!host.textContent?.includes('No posts to show'))
      await act(async () => Observer.latest.fire())
      assert.equal(requests.length, 2)
      assert.match(host.textContent ?? '', /Couldn.t load more posts/)
      assert.ok(!host.textContent?.includes("all caught up"))
      const retry = host.querySelector('button'); assert.ok(retry)
      await act(async () => retry.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
      assert.equal(requests.length, 3)
      assert.ok(requests[2].includes('cursor=next'), 'retry uses the same cursor')
      assert.equal(host.querySelector('article')?.textContent, 'later')
      assert.ok(!host.textContent?.includes('Couldn'))
    } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
  })
}

for (const kind of ['feed', 'profile'] as const) {
  test(`${kind} discards stale page results after view and viewer changes`, async () => {
    const originalFetch = globalThis.fetch
    const requests: { signal: AbortSignal; finish: (response: Response) => void }[] = []
    globalThis.fetch = (_input, init) => new Promise<Response>(finish => { requests.push({ signal: init!.signal as AbortSignal, finish }) })
    Object.assign(auth, { user: { id: 'viewer-a' }, loading: false, authUnavailable: false }); refreshes = 0
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
    const component = kind === 'feed' ? compiled.exports.FeedList : compiled.exports.ProfilePostList
    const oldView = { initialPosts: [{ id: 'old' }], initialCursor: 'first', initialHasMore: true, viewerId: 'viewer-a',
      ...(kind === 'feed' ? { filter: 'latest' } : { userId: 'owner-a', tab: 'all' }) }
    const newView = { initialPosts: [{ id: 'new' }], initialCursor: 'second', initialHasMore: true, viewerId: 'viewer-a',
      ...(kind === 'feed' ? { filter: 'picks' } : { userId: 'owner-b', tab: 'picks' }) }
    try {
      await act(async () => root.render(createElement(component, oldView)))
      await act(async () => Observer.latest.fire())
      assert.equal(requests.length, 1)
      await act(async () => root.render(createElement(component, newView)))
      assert.equal(requests[0].signal.aborted, true)
      await act(async () => Observer.latest.fire())
      assert.equal(requests.length, 2)
      await act(async () => requests[0].finish(Response.json({ posts: [{ id: 'stale' }], nextCursor: null, hasMore: false })))
      assert.ok(!host.textContent?.includes('stale'))
      assert.ok(host.textContent?.includes('new'))
      assert.ok(host.querySelector('[aria-label="Loading more posts"]'), 'old finally must not clear the new pending request')
      await act(async () => requests[1].finish(Response.json({ posts: [{ id: 'fresh' }], nextCursor: null, hasMore: false })))
      assert.ok(host.textContent?.includes('fresh'))

      // A transient auth outage does not masquerade as a signed-out viewer.
      Object.assign(auth, { user: null, authUnavailable: true })
      await act(async () => root.render(createElement(component, newView)))
      assert.ok(host.textContent?.includes('fresh')); assert.equal(refreshes, 0)
      // A confirmed switch must hide prior-account content before refreshing.
      Object.assign(auth, { user: { id: 'viewer-b' }, loading: true, authUnavailable: false })
      await act(async () => root.render(createElement(component, newView)))
      assert.ok(!host.textContent?.includes('fresh')); assert.ok(!host.textContent?.includes('new'))
      assert.match(host.textContent ?? '', /Updating/); assert.equal(refreshes, 1)
      auth.loading = false
      const switched = { ...newView, viewerId: 'viewer-b', initialPosts: [{ id: 'viewer-b-content' }] }
      await act(async () => root.render(createElement(component, switched)))
      assert.ok(host.textContent?.includes('viewer-b-content'))
    } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
  })
}
