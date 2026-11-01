import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const stubs: Record<string, string> = {
  'next/link': 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)',
  '@/components/social/UserBadges': 'export const UserBadges=()=>null',
  '@/components/social/MemberAvatar': 'export const MemberAvatar=()=>null',
  '@/components/ui/FloatingSurface': 'export const FloatingSurface=()=>null',
  '@/context/AuthContext': 'export const useAuth=()=>({user:null,loading:false,authUnavailable:false})',
  '@/lib/supabase/client': 'export const createClient=()=>({})',
  '@/lib/visiblePickRecords': 'export const fetchVisiblePickRecords=async()=>({records:new Map(),available:false})',
  './UserBadges': 'export const UserBadges=()=>null',
  './MemberAvatar': 'export const MemberAvatar=()=>null',
}
const bundle = await build({
  stdin: { contents: 'export {MentionProfileCard} from "./src/components/social/MentionProfileCard"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'mention-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { MentionProfileCard: ComponentType<{ profile: unknown }> } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)
const profile = { id: 'id', username: 'member', display_name: null, avatar_url: null, bio: null, is_verified: false, follower_count: 7 }

test('hidden or incomplete record shows no invented 0–0', () => {
  for (const pick_record of [null, {}, { wins: 2 }, { losses: 0 }]) {
    const markup = renderToStaticMarkup(createElement(compiled.exports.MentionProfileCard, { profile: { ...profile, pick_record } }))
    assert.match(markup, /7<\/strong> followers/)
    assert.doesNotMatch(markup, /record/)
  }
})

test('a genuine zero or nonzero visible record remains displayed', () => {
  for (const [pick_record, text] of [[{ wins: 0, losses: 0 }, '0-0'], [{ wins: 12, losses: 3 }, '12-3']] as const) {
    const markup = renderToStaticMarkup(createElement(compiled.exports.MentionProfileCard, { profile: { ...profile, pick_record } }))
    assert.ok(markup.includes(`${text}</strong> record`))
  }
})
