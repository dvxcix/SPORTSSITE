import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const fixture = { user: { id: 'verified-viewer' } as { id: string } | null, authError: null as unknown, profileError: null as unknown, profile: { account_type: 'admin', tier: 'free', admin_granted_tier: 'ultimate' } as any, calls: [] as any[], adminCreates: 0 }
function client(admin: boolean) {
  return {
    auth: { getUser: async () => ({ data: { user: fixture.user }, error: fixture.authError }) },
    from(table: string) {
      assert.equal(admin, table === 'users', 'Only the verified viewer profile may use the privileged client')
      let globalOnly = false
      const query = {
        select(columns: string) { fixture.calls.push({ admin, table, columns }); return query },
        eq(column: string, value: string) { fixture.calls.push({ column, value }); return query },
        is(column: string, value: unknown) { globalOnly = column === 'group_id' && value === null; return query },
        order() { return query },
        single: async () => ({ data: fixture.profileError ? null : fixture.profile, error: fixture.profileError }),
        then(done: any, failed: any) {
          const rows = [{ id: 'public', slug: 'general-sports', name: 'General Sports', channel_type: 'public' },
            { id: 'joined', group_id: 'joined-group', slug: 'joined-room', name: 'Joined room', channel_type: 'private' }]
          return Promise.resolve({ data: rows.filter(row => !globalOnly || row.group_id == null), error: null }).then(done, failed)
        },
      }
      return query
    },
  }
}
Object.assign(globalThis, { directoryQA: { fixture, client } })
const stubs: Record<string, string> = {
  './liveRooms.module.css': 'export default {}',
  '@/lib/supabase/server': 'export const createClient=async()=>globalThis.directoryQA.client(false)',
  '@/lib/supabase/admin': 'export const createAdminClient=()=>{globalThis.directoryQA.fixture.adminCreates++;return globalThis.directoryQA.client(true)}',
  'next/link': `import{createElement as h}from'react';export default({children,...props})=>h('a',props,children)`,
  '@/components/community/CommunityNav': 'export const CommunityNav=()=>null; export const CommunityMore=()=>null',
  '@/components/product/ProductPage': `import{createElement as h}from'react';export const ProductPageShell=({children})=>h('main',null,children);export const ProductAction=({href,children})=>h('a',{href},children)`,
}
const bundle = await build({ stdin: { contents: 'export {default as page} from "./src/app/channels/page"', resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], plugins: [{ name: 'directory-fixture', setup(b) { b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'qa' } : undefined); b.onLoad({ filter: /.*/, namespace: 'qa' }, a => ({ contents: stubs[a.path], loader: 'tsx' })) } }] })
const mod = { exports: {} as { page: () => Promise<React.ReactNode> } }; new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, mod, mod.exports)
function reset() { Object.assign(fixture, { user: { id: 'verified-viewer' }, authError: null, profileError: null, profile: { account_type: 'user', tier: 'free' }, calls: [], adminCreates: 0 }) }
const page = async () => renderToStaticMarkup(await mod.exports.page())

test('admin overrides keep public rooms visible and private account reads are bound to the verified user', async () => {
  reset(); fixture.profile = { account_type: 'admin', tier: 'free' }
  assert.match(await page(), /General Sports/)
  assert.equal(fixture.adminCreates, 1)
  assert.deepEqual(fixture.calls.find(c => c.column === 'id'), { column: 'id', value: 'verified-viewer' })
  assert.ok(fixture.calls.some(c => c.admin && c.columns.includes('admin_granted_tier')))
})
test('purchased and granted tiers retain access; a Discord discount claim alone does not grant access', async () => {
  for (const access of [{ admin_granted_tier: 'ultimate' }, { tier: 'basic' }]) {
    reset(); Object.assign(fixture.profile, access); assert.match(await page(), /General Sports/)
  }
  reset(); fixture.profile.discord_advanced_claimed = true; assert.doesNotMatch(await page(), /General Sports/)
})
test('free accounts retain community navigation and the global directory excludes group rooms', async () => {
  reset()
  const free = await page()
  assert.match(free, /href="\/groups"/)
  assert.doesNotMatch(free, /General Sports|Joined room/)
  fixture.profile = { account_type: 'user', tier: 'basic' }
  const member = await page()
  assert.match(member, /General Sports/)
  assert.doesNotMatch(member, /Joined room/)
})
test('failed or missing membership reads show a recoverable error instead of an empty directory', async () => {
  reset(); fixture.profileError = { code: '42501' }; await assert.rejects(page, /Membership access could not be loaded/)
  reset(); fixture.profile = null; await assert.rejects(page, /Membership access could not be loaded/)
})
test('anonymous reads never create a privileged client and auth failures stop the request', async () => {
  reset(); fixture.user = null; fixture.authError = { name: 'AuthSessionMissingError' }; assert.doesNotMatch(await page(), /General Sports/); assert.equal(fixture.adminCreates, 0)
  reset(); fixture.authError = { name: 'AuthRetryableFetchError' }; await assert.rejects(page, /Account access could not be verified/); assert.equal(fixture.adminCreates, 0); assert.equal(fixture.calls.length, 0)
})
