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
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
const blocksA = deferred<string[]>(), blocksB = deferred<string[]>(), oldNotifications = deferred<{ data: unknown[]; error: null }>(), oldSearchUsers = deferred<{ data: unknown[] }>()
const fixture = { auth: { user: { id: 'a' }, profile: null, loading: false, authUnavailable: false, retrySession: () => {}, signOut: () => {} }, blocksA, blocksB, oldNotifications, oldSearchUsers, notificationReads: 0, searchReads: 0, subscriptions: 0 }
const client = {
  from(table: string) {
    let head = false, selectedUser = ''
    const query = {
      select(_columns: string, options?: { head?: boolean }) { head = !!options?.head; return query },
      eq(column: string, value: string) { if (column === 'user_id') selectedUser = value; return query },
      not: () => query, order: () => query, limit: () => query, or: () => query, ilike: () => query, in: () => query, abortSignal: () => query,
      then(resolveValue: (value: unknown) => unknown) {
        if (table === 'users') {
          globalFixture.searchReads++
          if (globalFixture.auth.user.id === 'a') return oldSearchUsers.promise.then(resolveValue)
          return Promise.resolve({ data: [{ id: 'blocked', username: 'blocked-smith', display_name: 'Blocked Smith' }, { id: 'allowed', username: 'allowed-smith', display_name: 'Allowed Smith' }] }).then(resolveValue)
        }
        if (table === 'notifications' && head) return Promise.resolve({ count: 0, error: null }).then(resolveValue)
        if (table === 'notifications') {
          globalFixture.notificationReads++
          if (selectedUser === 'a') return oldNotifications.promise.then(resolveValue)
          return Promise.resolve({ data: [{ id: 'new', actor_id: 'blocked', message: 'Blocked B activity', type: 'mention', read: false, created_at: new Date().toISOString() }], error: null }).then(resolveValue)
        }
        return Promise.resolve({ data: [], error: null }).then(resolveValue)
      },
    }
    return query
  },
  channel() { globalFixture.subscriptions++; return { on() { return { subscribe: () => ({}) } } } },
  removeChannel() {},
}
Object.assign(globalThis, { topbarBlockFixture: { ...fixture, client } })
const globalFixture = (globalThis as unknown as { topbarBlockFixture: typeof fixture & { client: typeof client } }).topbarBlockFixture
const stubs: Record<string, string> = {
  'next/navigation': 'export const useRouter=()=>({push(){}})',
  'next/link': 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)',
  '@/context/AuthContext': 'export const useAuth=()=>globalThis.topbarBlockFixture.auth',
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.topbarBlockFixture.client',
  '@/lib/blocks': 'export const getBlockedEitherWayIds=(_client,id)=>id==="a"?globalThis.topbarBlockFixture.blocksA.promise:globalThis.topbarBlockFixture.blocksB.promise',
  '@/components/sports/PlayerAvatar': 'export const PlayerAvatar=()=>null;export const TeamLogo=()=>null',
  '@slipsurge/core/mlb-api': 'export const mlbHeadshot=()=>null;export const mlbTeamLogo=()=>null',
  '@/components/shared/NflTeamLogo': 'export const NflTeamLogo=()=>null',
  '@/lib/emoji': 'export const useCustomEmojis=()=>[]',
  '@/components/social/NotificationsList': 'export const collapseConsecutiveFollows=items=>items',
  '@slipsurge/core/tiers': 'export const effectiveTier=()=>"free";export const hasFullAccessOverride=()=>false',
  '@/components/ui/badge': 'import React from "react";export const Badge=({children})=>React.createElement("span",null,children)',
  '@/components/social/MemberAvatar': 'export const MemberAvatar=()=>null',
  '@/components/ui/SafeImage': 'export const SafeImage=()=>null',
  '@/components/ui/FloatingSurface': 'import React from "react";export const FloatingSurface=({open,children})=>open?React.createElement("div",null,children):null',
  '@/components/social/EmojiText': 'import React from "react";export const EmojiText=({text})=>React.createElement("span",null,text)',
  '@/lib/nbaAccessPolicy': 'export const hasNbaAccess=()=>false',
}
const bundle = await build({
  stdin: { contents: 'export {TopBar} from "./src/components/layout/TopBar"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'topbar-block-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})

test('pending or failed block lookup cannot start notification or member queries', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ players: [], teams: [] })
  globalFixture.auth = { ...globalFixture.auth, user: { id: 'a' } }
  globalFixture.blocksA = deferred<string[]>()
  globalFixture.notificationReads = 0; globalFixture.searchReads = 0; globalFixture.subscriptions = 0
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(compiled.exports.TopBar)) })
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Search SlipSurge"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'smith')
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      host.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]')!.click()
    })
    await act(async () => { await new Promise(resolveValue => setTimeout(resolveValue, 300)) })
    assert.equal(globalFixture.notificationReads, 0); assert.equal(globalFixture.searchReads, 0); assert.equal(globalFixture.subscriptions, 0)
    assert.ok(host.textContent?.includes('Could not refresh activity.'))
    await act(async () => { globalFixture.blocksA.reject(new Error('unavailable')); await Promise.resolve() })
    assert.equal(globalFixture.notificationReads, 0); assert.equal(globalFixture.searchReads, 0); assert.equal(globalFixture.subscriptions, 0)
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
})
const compiled = { exports: {} as { TopBar: ComponentType } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)

test('late notification and quick-search responses cannot cross accounts or show blocked actors', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ players: [], teams: [] })
  globalFixture.auth = { ...globalFixture.auth, user: { id: 'a' } }
  globalFixture.blocksA = blocksA; globalFixture.blocksB = blocksB
  globalFixture.notificationReads = 0; globalFixture.searchReads = 0
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(compiled.exports.TopBar)) })
    await act(async () => { blocksA.resolve([]); await Promise.resolve() })
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Search SlipSurge"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'smith')
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await act(async () => { await new Promise(resolveValue => setTimeout(resolveValue, 300)) })
    assert.equal(globalFixture.searchReads, 1)
    const open = () => host.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]')!.click()
    await act(async () => { open(); await Promise.resolve() })
    assert.equal(globalFixture.notificationReads, 1)
    globalFixture.auth = { ...globalFixture.auth, user: { id: 'b' } }
    await act(async () => { root.render(createElement(compiled.exports.TopBar)); await Promise.resolve() })
    await act(async () => { oldNotifications.resolve({ data: [{ id: 'old', actor_id: 'someone', message: 'Old A activity', type: 'mention', read: false, created_at: new Date().toISOString() }], error: null }); oldSearchUsers.resolve({ data: [{ id: 'old', username: 'old-smith', display_name: 'Old A Smith' }] }); await Promise.resolve() })
    assert.ok(!host.textContent?.includes('Old A activity'))
    assert.ok(!host.textContent?.includes('Old A Smith'))
    await act(async () => { blocksB.resolve(['blocked']); await Promise.resolve() })
    await act(async () => { await new Promise(resolveValue => setTimeout(resolveValue, 300)) })
    assert.ok(host.textContent?.includes('Allowed Smith'))
    assert.ok(!host.textContent?.includes('Blocked Smith'))
    await act(async () => { open(); await Promise.resolve() })
    assert.equal(globalFixture.notificationReads, 2)
    assert.ok(!host.textContent?.includes('Old A activity'))
    assert.ok(!host.textContent?.includes('Blocked B activity'))
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
})
