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
const posts = [
  { id: 'baseball-post', sport: 'MLB', author_id: 'x', author: { id: '00000000-0000-0000-0000-000000000001', username: 'baseball' } },
  { id: 'football-post', sport: 'NFL', game_pk: '123', author_id: 'y', author: { id: '00000000-0000-0000-0000-000000000002', username: 'football' } },
]
const groups = [{ id: 'b', slug: 'baseball-group', name: 'Baseball Group', sport: 'MLB', is_public: true }, { id: 'f', slug: 'football-group', name: 'Football Group', sport: 'NFL', is_public: true }]
const stories = [{ id: 'b', sport: 'mlb', author: { username: 'baseball-story' } }, { id: 'f', sport: 'NFL', author: { username: 'football-story' } }]
const state = { admin: false, attached: [] as string[], hideRecord: false, recordError: false, recordCalls: 0 }
const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'viewer' } }, error: null }) },
  rpc(name: string, args: { target_ids: string[] }) {
    assert.equal(name, 'get_visible_pick_records')
    state.recordCalls++
    return { abortSignal: async () => ({ data: state.recordError ? null : args.target_ids.map(profile_id => ({ profile_id, pick_record: state.hideRecord ? null : { wins: 4, losses: 2, pushes: 0 } })), error: state.recordError ? {} : null }) }
  },
  from(table: string) {
    const query = {
      select: () => query, eq: () => query, neq: () => query, in: () => query, ilike: () => query, or: () => query, gte: () => query, gt: () => query, not: () => query, order: () => query, limit: () => query,
      single: async () => ({ data: table === 'users' ? { account_type: state.admin ? 'admin' : 'user' } : table === 'groups' ? groups[0] : table === 'posts' ? posts[1] : table === 'pages' ? { id: 'page', slug: 'page', name: 'Page', created_at: '2026-01-01' } : null }),
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
  'next/cache': 'export const unstable_cache=(fn)=>fn',
  'next/link': 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)',
  'next/image': 'export default ()=>null',
  '@/lib/supabase/server': 'export const createClient=async()=>globalThis.mlbSocialFixture.client',
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.mlbSocialFixture.client',
  '@/lib/mlbViewerAccess': 'export const canViewMlb=async()=>globalThis.mlbSocialFixture.state.admin',
  '@/context/AuthContext': 'export const useAuth=()=>({profile:{account_type:globalThis.mlbSocialFixture.state.admin?"admin":"user"}})',
  '@/lib/queries': 'export const attachUserReactions=async rows=>{globalThis.mlbSocialFixture.state.attached=rows.map(p=>p.id);return rows};export const getChannelMessages=async()=>[]',
  '@/lib/blocks': 'export const authVisibilityUnavailable=()=>false;export const getBlockedEitherWayIds=async()=>[]',
  '@/lib/creator': 'export const hasCreatorAccess=()=>true',
  '@/components/social/PostCardClient': 'import React from "react";export const PostCardClient=({post})=>React.createElement("span",null,post.id+":"+(post.author?.pick_record ? post.author.pick_record.wins : "hidden"))',
  '@/components/social/UserBadges': 'export const UserBadges=()=>null',
  '@/components/social/FollowButton': 'export const FollowButton=()=>null',
  '@/components/sports/GameCard': 'export const GameCard=()=>null',
  '@/components/social/FeedComposer': 'export const FeedComposer=()=>null',
  '@/components/groups/GroupJoinButton': 'export const GroupJoinButton=()=>null',
  '@/components/groups/GroupInviteModal': 'export const GroupInviteModal=()=>null',
  '@/components/groups/GroupInviteResponse': 'export const GroupInviteResponse=()=>null',
  '@/components/groups/GroupWorkspaceTabs': 'export const GroupWorkspaceTabs=({posts})=>posts',
  '@/components/groups/GroupMemberOnboarding': 'export const GroupMemberOnboarding=()=>null',
  '@/components/groups/GroupChannelWorkspace': 'export const GroupChannelWorkspace=()=>null',
  '@/components/pages/PageFollowButton': 'export const PageFollowButton=()=>null',
  '@/components/groups/GroupSettingsForm': 'export const GroupSettingsForm=()=>null',
  '@/components/groups/GroupMemberManager': 'export const GroupMemberManager=()=>null',
  '@/components/groups/GroupChannelManager': 'export const GroupChannelManager=()=>null',
  '@/components/groups/GroupRoleManager': 'export const GroupRoleManager=()=>null',
  '@/components/chat/ChatRoom': 'export const ChatRoom=()=>null',
  '@/lib/sportLogos': 'export const sportLogoUrl=()=>null',
  '@/lib/hrFeed': 'export const fetchHrFeed=async()=>({hrFeed:[]})',
  '@/lib/nflScoreboard': 'export const getStoredNflScoreboard=async()=>[]',
  '@/lib/nflGameCenterServer': 'export const getNflGameCenter=async()=>null',
  '@/lib/nbaGameReference': 'export const nbaGameReference=async()=>null',
  '@slipsurge/core/mlbSchedule': 'export const fetchScheduleWithRetry=async()=>[]',
  '@slipsurge/core/mlb-api': 'export const getMLBGameFeed=async()=>null',
  '@slipsurge/core/espn-api': 'export const getScoreboard=async sport=>sport==="nfl"?[{id:"123",status:{type:{state:"pre"}}}]:[];export const getGameSummary=async()=>null;export const getGameStatus=()=>({state:"pre",label:"",isLive:false});export const getTeams=()=>({})',
  './GameDetailClient': 'import React from "react";export const GameDetailClient=({communityPicks})=>React.createElement("div",null,communityPicks.map(p=>React.createElement("span",{key:p.id},p.id+":"+(p.author?.pick_record?p.author.pick_record.wins:"hidden"))))',
  './MLBGameClient': 'export const MLBGameClient=()=>null',
  '@/components/social/MemberAvatar': 'export const MemberAvatar=()=>null',
  '@/components/ui/SafeImage': 'export const SafeImage=()=>null',
  '@/components/layout/TierGate': 'export const TierGate=({children})=>children',
  '@/components/layout/PageState': 'export const PageState=()=>null',
  '@/components/community/CommunityNav': 'export const CommunityNav=()=>null',
  '@/components/product/ProductPage': 'import React from "react";export const ProductHero=()=>null;export const ProductAction=()=>null;export const ProductSectionHeader=()=>null;export const ProductPanel=({children})=>React.createElement("div",null,children);export const ProductPageShell=({children})=>React.createElement("main",null,children)',
  './StoriesViewer': 'export const StoriesViewer=()=>null',
}
const result = await build({
  stdin: { contents: 'export { default as Hashtag } from "./src/app/hashtag/[tag]/page";export { default as Bookmarks } from "./src/app/bookmarks/page";export { default as Picks } from "./src/app/picks/page";export { default as Post } from "./src/app/posts/[id]/page";export { default as Page } from "./src/app/pages/[slug]/page";export { default as Explore } from "./src/app/explore/page";export { default as Game } from "./src/app/sports/[sport]/[gameId]/page";export { default as Groups } from "./src/app/groups/page";export { default as GroupDetail, generateMetadata as groupMetadata } from "./src/app/groups/[slug]/page";export { default as GroupSettings } from "./src/app/groups/[slug]/settings/page";export { StoriesBar } from "./src/components/social/StoriesBar"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'social-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs || args.path.endsWith('.module.css') ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('.module.css') ? 'export default {}' : stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { Hashtag: (props: unknown) => Promise<React.ReactNode>; Bookmarks: () => Promise<React.ReactNode>; Picks: (props: unknown) => Promise<React.ReactNode>; Post: (props: unknown) => Promise<React.ReactNode>; Page: (props: unknown) => Promise<React.ReactNode>; Explore: () => Promise<React.ReactNode>; Game: (props: unknown) => Promise<React.ReactNode>; Groups: () => Promise<React.ReactNode>; GroupDetail: (props: unknown) => Promise<React.ReactNode>; groupMetadata: (props: unknown) => Promise<{ title?: string }>; GroupSettings: (props: unknown) => Promise<React.ReactNode>; StoriesBar: ComponentType } }
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

test('hashtag and bookmark records are viewer-scoped and fail closed on lookup errors', async () => {
  state.admin = false; state.hideRecord = false; state.recordError = false; state.recordCalls = 0
  const visible = renderToStaticMarkup(await compiled.exports.Hashtag({ params: Promise.resolve({ tag: 'football' }) }))
  assert.ok(visible.includes('football-post:4')); assert.equal(state.recordCalls, 1)
  state.hideRecord = true
  const hidden = renderToStaticMarkup(await compiled.exports.Bookmarks())
  assert.ok(hidden.includes('football-post:hidden')); assert.equal(state.recordCalls, 2)
  state.hideRecord = false; state.recordError = true
  const failed = renderToStaticMarkup(await compiled.exports.Hashtag({ params: Promise.resolve({ tag: 'football' }) }))
  assert.ok(failed.includes('football-post:hidden')); assert.equal(state.recordCalls, 3)
  state.recordError = false
})

test('picks, post details and page posts receive only the caller-scoped record', async () => {
  state.admin = false; state.hideRecord = false; state.recordError = false; state.recordCalls = 0
  const picks = renderToStaticMarkup(await compiled.exports.Picks({ searchParams: Promise.resolve({}) }))
  assert.ok(picks.includes('football-post:4')); assert.equal(state.recordCalls, 1)
  state.hideRecord = true
  const post = renderToStaticMarkup(await compiled.exports.Post({ params: Promise.resolve({ id: 'football-post' }) }))
  assert.ok(post.includes('football-post:hidden')); assert.equal(state.recordCalls, 2)
  state.recordError = true
  const page = renderToStaticMarkup(await compiled.exports.Page({ params: Promise.resolve({ slug: 'page' }) }))
  assert.ok(page.includes('football-post:hidden')); assert.equal(state.recordCalls, 3)
  state.recordError = false; state.hideRecord = false
})

test('explore batches records and game pages respect each viewer independently', async () => {
  state.admin = false; state.hideRecord = false; state.recordError = false; state.recordCalls = 0
  const explore = renderToStaticMarkup(await compiled.exports.Explore())
  assert.ok(explore.includes('football-post:4')); assert.equal(state.recordCalls, 1)
  state.hideRecord = true
  const game = renderToStaticMarkup(await compiled.exports.Game({ params: Promise.resolve({ sport: 'nfl', gameId: '123' }) }))
  assert.ok(game.includes('football-post:hidden')); assert.equal(state.recordCalls, 2)
  state.hideRecord = false
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

test('group posts do not reuse another viewer’s visible record', async () => {
  state.admin = true; state.hideRecord = false; state.recordError = false; state.recordCalls = 0
  const props = { params: Promise.resolve({ slug: 'baseball-group' }), searchParams: Promise.resolve({}) }
  const visible = renderToStaticMarkup(await compiled.exports.GroupDetail(props))
  assert.ok(visible.includes('football-post:4')); assert.equal(state.recordCalls, 1)
  state.hideRecord = true
  const hidden = renderToStaticMarkup(await compiled.exports.GroupDetail(props))
  assert.ok(hidden.includes('football-post:hidden')); assert.equal(state.recordCalls, 2)
  state.hideRecord = false; state.admin = false
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
