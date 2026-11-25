import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/lib/nativeCommunitySettings.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'community-settings-fixture', setup(plugin) {
    plugin.onResolve({ filter: /^(server-only|\.\/blocks|\.\/mlbViewerAccess)$/ }, arg => ({ path: arg.path, namespace: 'fixture' }))
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({
      contents: arg.path === './blocks' ? 'export const isAccountId = () => true' :
        arg.path === './mlbViewerAccess' ? 'export const canViewMlb = async () => true' : '',
    }))
  } }],
})
const module = { exports: {} as typeof import('../src/lib/nativeCommunitySettings') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)

test('community member settings use the deployed joined-at field and preserve member management scope', async () => {
  const fields: string[] = []
  const member = { id: 'member', role: 'member' }
  const client = {
    from(table: string) {
      assert.equal(table, 'group_members')
      return {
        select() { return this },
        eq(column: string, value: string) { assert.equal(column, 'group_id'); assert.equal(value, 'group'); return this },
        order(column: string) { fields.push(column); return this },
        async limit(amount: number) { assert.equal(amount, 500); return { data: [member], error: null } },
      }
    },
  } as unknown as Parameters<typeof module.exports.nativeCommunitySettings>[0]
  const page = await module.exports.nativeCommunitySettings(client, {
    group: { id: 'group' }, allowMlb: true, owner: false, roleManagement: false, channelManagement: false, memberManagement: true, invite: false,
  } as Parameters<typeof module.exports.nativeCommunitySettings>[1])
  assert.deepEqual(fields, ['joined_at', 'user_id'])
  assert.deepEqual(page.members, [member])
  assert.deepEqual(page.channels, [])
})
