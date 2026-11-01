import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/feed' })
dom.window.matchMedia = () => ({ matches: false })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const deferred = <T,>() => { let resolveValue!: (value: T) => void; const promise = new Promise<T>(done => { resolveValue = done }); return { promise, resolve: resolveValue } }
const userA = '00000000-0000-0000-0000-00000000000a', userB = '00000000-0000-0000-0000-00000000000b', author = '00000000-0000-0000-0000-000000000001'
type Result = { records: Map<string, { wins: number; losses: number; pushes: number } | null>; available: boolean }
const fixture = { auth: { user: { id: userA }, loading: false, authUnavailable: false }, a: deferred<Result>(), b: deferred<Result>(), calls: 0 }
Object.assign(globalThis, { mentionSwitchFixture: fixture })
const stubs: Record<string, string> = {
  'next/link': 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)',
  './UserBadges': 'export const UserBadges=()=>null',
  './MemberAvatar': 'export const MemberAvatar=()=>null',
  '@/components/ui/FloatingSurface': 'import React from "react"; export const FloatingSurface=({open,children})=>open?React.createElement("div",null,children):null',
  '@/context/AuthContext': 'export const useAuth=()=>globalThis.mentionSwitchFixture.auth',
  '@/lib/supabase/client': 'export const createClient=()=>({})',
  '@/lib/visiblePickRecords': 'export const fetchVisiblePickRecords=()=>{const f=globalThis.mentionSwitchFixture;f.calls++;return f.auth.user.id.endsWith("a")?f.a.promise:f.b.promise}',
}
const bundle = await build({
  stdin: { contents: 'export {ProfileHoverTarget} from "./src/components/social/MentionProfileCard"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'mention-switch-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { ProfileHoverTarget: ComponentType<{ profile: unknown; children?: string }> } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)
const profile = { id: author, username: 'member', display_name: null, avatar_url: null, bio: null, is_verified: false, follower_count: 0, pick_record: { wins: 99, losses: 99, pushes: 0 } }
const pause = () => new Promise(done => setTimeout(done, 150))

test('hover loads once and a previously visible record disappears immediately on account switch', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const render = () => root.render(createElement(compiled.exports.ProfileHoverTarget, { profile }, 'Open profile'))
  try {
    await act(async () => { render() })
    assert.equal(fixture.calls, 0)
    await act(async () => { host.querySelector('span')!.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })); await pause() })
    assert.equal(fixture.calls, 1)
    assert.ok(!host.textContent?.includes('99-99'))
    await act(async () => { fixture.a.resolve({ records: new Map([[author, { wins: 9, losses: 2, pushes: 0 }]]), available: true }); await Promise.resolve() })
    assert.ok(host.textContent?.includes('9-2'))
    fixture.auth = { user: { id: userB }, loading: false, authUnavailable: false }
    await act(async () => { render() })
    assert.ok(!host.textContent?.includes('9-2'))
    // Switch back before B resolves: the previous A result must not reappear.
    fixture.a = deferred<Result>()
    fixture.auth = { user: { id: userA }, loading: false, authUnavailable: false }
    await act(async () => { render() })
    assert.ok(!host.textContent?.includes('9-2'))
    await act(async () => { fixture.b.resolve({ records: new Map([[author, null]]), available: true }); await Promise.resolve() })
    assert.ok(!host.textContent?.includes('9-2'))
    assert.ok(!host.textContent?.includes('0-0'))
    await act(async () => { fixture.a.resolve({ records: new Map([[author, null]]), available: true }); await Promise.resolve() })
    assert.ok(!host.textContent?.includes('9-2'))
  } finally { await act(async () => root.unmount()); host.remove() }
})
