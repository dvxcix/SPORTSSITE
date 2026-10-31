import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/feed' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const posts = [{ id: 'baseball-post', sport: 'MLB', author_id: 'x' }, { id: 'football-post', sport: 'NFL', author_id: 'y' }]
const groups = [{ id: 'b', slug: 'baseball-group', name: 'Baseball Group', sport: 'MLB', is_public: true }, { id: 'f', slug: 'football-group', name: 'Football Group', sport: 'NFL', is_public: true }]
const stories = [{ id: 'b', sport: 'mlb', author: { username: 'baseball-story' } }, { id: 'f', sport: 'NFL', author: { username: 'football-story' } }]
const state = { admin: false, attached: [] as string[] }
const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'viewer' } }, error: null }) },
  from(table: string) {
    const query = {
      select: () => query, eq: () => query, or: () => query, gte: () => query, gt: () => query, not: () => query, order: () => query, limit: () => query,
      single: async () => ({ data: table === 'users' ? { account_type: state.admin ? 'admin' : 'user' } : table === 'groups' ? groups[0] : null }),
      maybeSingle: async () => ({ data: null }),
      then(done: (value: unknown) => unknown) {
        const data = table === 'posts' ? posts : table === 'bookmarks' ? posts.map(post => ({ post })) : table === 'groups' ? groups : table === 'stories' ? stories : []
        return Promise.resolve({ data, error: null }).then(done)
      },
    }
    return query
  },
}
Object.assign(globalThis, { mlbSocialFixture: { client, state } })
const stubs: Record<string, string> = {
  'next/navigation': 'export const notFound=()=>{throw Error("not-found")};export const redirect=()=>{throw Error("redirect")}',
  'next/link': 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)',
  'next/image': 'export default ()=>null',
  '@/lib/supabase/server': 'export const createClient=async()=>globalThis.mlbSocialFixture.client',
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.mlbSocialFixture.client',
  '@/lib/mlbViewerAccess': 'export const canViewMlb=async()=>globalThis.mlbSocialFixture.state.admin',
  '@/context/AuthContext': 'export const useAuth=()=>({profile:{account_type:globalThis.mlbSocialFixture.state.admin?"admin":"user"}})',
  '@/lib/queries': 'export const attachUserReactions=async rows=>{globalThis.mlbSocialFixture.state.attached=rows.map(p=>p.id);return rows};export const getChannelMessages=async()=>[]',
  '@/lib/blocks': 'export const authVisibilityUnavailable=()=>false;export const getBlockedEitherWayIds=async()=>[]',
  '@/lib/creator': 'export const hasCreatorAccess=()=>true',
  '@/components/social/PostCardClient': 'import React from "react";export const PostCardClient=({post})=>React.createElement("span",null,post.id)',
  '@/components/social/FeedComposer': 'export const FeedComposer=()=>null',
  '@/components/groups/GroupJoinButton': 'export const GroupJoinButton=()=>null',
  '@/components/groups/GroupInviteModal': 'export const GroupInviteModal=()=>null',
  '@/components/groups/GroupInviteResponse': 'export const GroupInviteResponse=()=>null',
  '@/components/groups/GroupWorkspaceTabs': 'export const GroupWorkspaceTabs=()=>null',
  '@/components/groups/GroupMemberOnboarding': 'export const GroupMemberOnboarding=()=>null',
  '@/components/groups/GroupChannelWorkspace': 'export const GroupChannelWorkspace=()=>null',
  '@/components/groups/GroupSettingsForm': 'export const GroupSettingsForm=()=>null',
  '@/components/groups/GroupMemberManager': 'export const GroupMemberManager=()=>null',
  '@/components/groups/GroupChannelManager': 'export const GroupChannelManager=()=>null',
  '@/components/groups/GroupRoleManager': 'export const GroupRoleManager=()=>null',
  '@/components/chat/ChatRoom': 'export const ChatRoom=()=>null',
  '@/lib/sportLogos': 'export const sportLogoUrl=()=>null',
  '@/components/social/MemberAvatar': 'export const MemberAvatar=()=>null',
  '@/components/ui/SafeImage': 'export const SafeImage=()=>null',
  '@/components/layout/TierGate': 'export const TierGate=({children})=>children',
  '@/components/layout/PageState': 'export const PageState=()=>null',
  '@/components/community/CommunityNav': 'export const CommunityNav=()=>null',
  '@/components/product/ProductPage': 'import React from "react";export const ProductHero=()=>null;export const ProductAction=()=>null;export const ProductSectionHeader=()=>null;export const ProductPanel=({children})=>React.createElement("div",null,children);export const ProductPageShell=({children})=>React.createElement("main",null,children)',
  './StoriesViewer': 'export const StoriesViewer=()=>null',
}
const result = await build({
  stdin: { contents: 'export { default as Hashtag } from "./src/app/hashtag/[tag]/page";export { default as Bookmarks } from "./src/app/bookmarks/page";export { default as Groups } from "./src/app/groups/page";export { default as GroupDetail, generateMetadata as groupMetadata } from "./src/app/groups/[slug]/page";export { default as GroupSettings } from "./src/app/groups/[slug]/settings/page";export { StoriesBar } from "./src/components/social/StoriesBar"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'social-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs || args.path.endsWith('.module.css') ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('.module.css') ? 'export default {}' : stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { Hashtag: (props: unknown) => Promise<React.ReactNode>; Bookmarks: () => Promise<React.ReactNode>; Groups: () => Promise<React.ReactNode>; GroupDetail: (props: unknown) => Promise<React.ReactNode>; groupMetadata: (props: unknown) => Promise<{ title?: string }>; GroupSettings: (props: unknown) => Promise<React.ReactNode>; StoriesBar: ComponentType } }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, compiled, compiled.exports)

test('hashtag and bookmarks hide MLB posts from members and retain admin access', async () => {
  state.admin = false
  await compiled.exports.Hashtag({ params: Promise.resolve({ tag: 'football' }) })
  assert.deepEqual(state.attached, ['football-post'])
  await assert.rejects(compiled.exports.Hashtag({ params: Promise.resolve({ tag: 'mlb' }) }), /not-found/)
  await compiled.exports.Bookmarks()
  assert.deepEqual(state.attached, ['football-post'])
  state.admin = true
  await compiled.exports.Hashtag({ params: Promise.resolve({ tag: 'mlb' }) })
  assert.deepEqual(state.attached, ['baseball-post', 'football-post'])
  await compiled.exports.Bookmarks()
  assert.deepEqual(state.attached, ['baseball-post', 'football-post'])
})

test('group directory hides MLB for members but retains NFL and admin access', async () => {
  state.admin = false
  const member = renderToStaticMarkup(await compiled.exports.Groups())
  assert.ok(member.includes('Football Group')); assert.ok(!member.includes('Baseball Group'))
  state.admin = true
  const admin = renderToStaticMarkup(await compiled.exports.Groups())
  assert.ok(admin.includes('Baseball Group')); assert.ok(admin.includes('Football Group'))
})

test('direct MLB group and settings links deny members, and metadata does not leak the group name', async () => {
  state.admin = false
  const params = Promise.resolve({ slug: 'baseball-group' })
  await assert.rejects(compiled.exports.GroupDetail({ params, searchParams: Promise.resolve({}) }), /not-found/)
  await assert.rejects(compiled.exports.GroupSettings({ params }), /not-found/)
  assert.equal((await compiled.exports.groupMetadata({ params })).title, undefined)
  state.admin = true
  assert.equal((await compiled.exports.groupMetadata({ params })).title, 'Baseball Group · SlipSurge')
})

test('stories hide MLB immediately if the viewer loses admin access', async () => {
  state.admin = true
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(compiled.exports.StoriesBar)); await Promise.resolve(); await Promise.resolve() })
    assert.ok(host.textContent?.includes('baseball-story')); assert.ok(host.textContent?.includes('football-story'))
    state.admin = false
    await act(async () => { root.render(createElement(compiled.exports.StoriesBar)) })
    assert.ok(!host.textContent?.includes('baseball-story')); assert.ok(host.textContent?.includes('football-story'))
  } finally { await act(async () => root.unmount()); host.remove() }
})
