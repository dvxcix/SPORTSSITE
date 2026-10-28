import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, StrictMode, type ComponentType, type ReactNode } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/the-paint' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')

type Channel = { topic: string; listener: (payload: unknown) => void; removed: boolean; removing: boolean }
const channels: Channel[] = []
let clientCalls = 0
const client = {
  channel(name: string) {
    assert.match(name, /^posts-live-shared:\d+$/)
    // The actual SDK reuses a topic while its asynchronous removal is pending.
    if (channels.some(channel => channel.topic === name && !channel.removed)) throw new Error('reused a channel pending removal')
    const channel: Channel = { topic: name, listener: () => {}, removed: false, removing: false }
    channels.push(channel)
    return {
      on(event: string, config: unknown, listener: Channel['listener']) {
        assert.equal(event, 'postgres_changes')
        assert.deepEqual(config, { event: 'UPDATE', schema: 'public', table: 'posts' })
        channel.listener = listener
        return { subscribe: () => channel }
      },
    }
  },
  removeChannel(channel: Channel) { channel.removing = true; return new Promise<void>(() => {}) },
}
Object.assign(globalThis, { postLiveFixtureClient: client, postLiveFixtureCreate: () => { clientCalls++; return client } })
const bundle = await build({
  stdin: { contents: 'export {PostLiveProvider,usePostLiveUpdates} from "./src/context/PostLiveContext"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'post-live-fixture', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'client', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient=()=>globalThis.postLiveFixtureCreate()', loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { PostLiveProvider: ComponentType<{ children?: ReactNode }>; usePostLiveUpdates: (id: string | undefined, cb: (payload: unknown) => void) => void } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)

const received: Record<string, unknown[]> = {}
function Post({ id, instance }: { id: string; instance: string }) {
  compiled.exports.usePostLiveUpdates(id, payload => { (received[instance] ??= []).push(payload) })
  return null
}

async function harness(strict = false) {
  channels.length = 0
  clientCalls = 0
  for (const key of Object.keys(received)) delete received[key]
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const render = async (posts: { id: string; instance: string }[]) => {
    const children = posts.map(post => createElement(Post, { ...post, key: post.instance }))
    const tree = createElement(compiled.exports.PostLiveProvider, null, children)
    await act(async () => root.render(strict ? createElement(StrictMode, null, tree) : tree))
  }
  const close = async () => { await act(async () => root.unmount()); host.remove() }
  return { render, close }
}

test('research page opens no posts channel until a post mounts and closes it after the last unmount', async () => {
  const ui = await harness()
  try {
    await ui.render([])
    assert.equal(clientCalls, 0)
    assert.equal(channels.length, 0)
    await ui.render([{ id: 'a', instance: 'a1' }, { id: 'a', instance: 'a2' }, { id: 'b', instance: 'b1' }])
    assert.equal(clientCalls, 1)
    assert.equal(channels.length, 1)
    const a = { new: { id: 'a' } }, b = { new: { id: 'b' } }
    await act(async () => { channels[0].listener(a); channels[0].listener(b); channels[0].listener({ new: { id: 'other' } }) })
    assert.deepEqual(received.a1, [a]); assert.deepEqual(received.a2, [a]); assert.deepEqual(received.b1, [b])
    await ui.render([{ id: 'b', instance: 'b1' }])
    assert.equal(channels[0].removing, false)
    await ui.render([])
    assert.equal(channels[0].removing, true)
    await act(async () => channels[0].listener(b))
    assert.deepEqual(received.b1, [b])
    await ui.render([{ id: 'a', instance: 'a3' }])
    assert.equal(channels.length, 2); assert.equal(channels[1].removing, false)
    assert.notEqual(channels[0].topic, channels[1].topic)
    await act(async () => channels[1].listener(a))
    assert.deepEqual(received.a3, [a])
  } finally { await ui.close() }
  assert.equal(channels[1].removing, true)
})

test('strict-mode remounts leave exactly one live channel and release it', async () => {
  const ui = await harness(true)
  try {
    await ui.render([{ id: 'a', instance: 'a' }])
    assert.equal(channels.filter(channel => !channel.removing).length, 1)
    await ui.render([])
    assert.equal(channels.filter(channel => !channel.removing).length, 0)
  } finally { await ui.close() }
})
