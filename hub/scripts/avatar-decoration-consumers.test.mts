import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const bundle = await build({
  stdin: { contents: 'export { NotificationsList } from "./src/components/social/NotificationsList"; export { LeaderboardClient } from "./src/app/leaderboard/LeaderboardClient"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom', 'react-dom/server'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'inert-consumer-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(next\/link|@\/lib\/supabase\/client|@\/lib\/emoji|@\/components\/ui\/FeedbackProvider|@\/components\/social\/(UserBadges|EmojiText))$|\.module\.css$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents:
      args.path === 'next/link' ? 'import {createElement} from "react"; export default function Link({children,...props}){return createElement("a",props,children)}' :
      args.path.includes('supabase/client') ? 'export const createClient=()=>({from:()=>{throw Error("Unexpected data read during avatar rendering")}})' :
      args.path.includes('FeedbackProvider') ? 'export const useFeedback=()=>({confirm:async()=>false,notify:()=>{}})' :
      args.path.includes('lib/emoji') ? 'export const useCustomEmojis=()=>[]' :
      args.path.includes('UserBadges') ? 'export const UserBadges=()=>null' :
      args.path.includes('EmojiText') ? 'export const EmojiText=({text})=>text' :
      'export default new Proxy({},{get:(_,key)=>String(key)})',
    }))
  } }],
})
const module = { exports: {} as Record<string, React.ComponentType<Record<string, unknown>>> }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports)
const actor = { username: 'review-member', display_name: 'Review Member', avatar_url: '/member.jpg', avatar_ring_style: 'deco:ss-crown', avatar_ring_color: '#ff4d6a' }

test('individual/grouped member notifications retain decorations; team announcements keep their team mark', () => {
  const base = { read: true, message: 'Activity', body: null, link: '/profile/review-member', created_at: new Date().toISOString() }
  const initialNotifications = [
    { ...base, id: 'comment', type: 'comment', actor },
    { ...base, id: 'lineup', type: 'lineup_confirmed', actor: null, data: { avatar_url: '/team-logo.svg' } },
    { ...base, id: 'follow-a', type: 'follow', actor },
    { ...base, id: 'follow-b', type: 'follow', actor: { ...actor, username: 'other-member' } },
  ]
  const doc = new JSDOM(renderToStaticMarkup(h(module.exports.NotificationsList, { userId: 'viewer', initialNotifications }))).window.document
  assert.equal(doc.querySelectorAll('.ss-avatar-decoration img[src="/avatar-decorations/still/ss-crown.svg"]').length, 2)
  assert.ok(doc.querySelector('img[src="/team-logo.svg"]'))
  assert.equal(doc.querySelector('img[src="/team-logo.svg"]')?.closest('.ss-member-avatar'), null)
  assert.match(doc.body.textContent!, /and 1 other followed you/)
})

test('leaderboard podium and list rows carry each member’s selected decoration', () => {
  const styles = ['ss-crown', 'bb-swish', 'fb-spiral', 'bs-stitches']
  const users = styles.map((id, index) => ({ ...actor, id: `user-${index}`, username: `member-${index}`, avatar_ring_style: `deco:${id}`, is_verified: false, account_type: 'user', follower_count: 0, wins: 10, losses: 5, pushes: 0, total: 15, winPct: 66.7, streak: 1, recentResults: ['W'], thisWeek: { wins: 1, losses: 0 }, bySport: {} }))
  const doc = new JSDOM(renderToStaticMarkup(h(module.exports.LeaderboardClient, { users, allSports: [] }))).window.document
  for (const id of styles) assert.ok(doc.querySelector(`.ss-avatar-decoration img[src="/avatar-decorations/still/${id}.svg"]`), id)
})
