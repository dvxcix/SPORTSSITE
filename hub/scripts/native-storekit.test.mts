import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/lib/storeKitSignedData.ts', 'src/lib/storeKitEntitlements.ts'],
  outdir: 'fixtures',
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['server-only', '@apple/app-store-server-library', '@/lib/supabase/admin'],
})
const require = createRequire(import.meta.url)
function loadFixture<Module>(name: string) {
  const source = bundle.outputFiles.find(file => file.path.endsWith(`/${name}.js`))
  assert.ok(source)
  const fixture = { exports: {} as Module }
  const fixtureRequire = (path: string) => {
    if (path === 'server-only') return {}
    if (path === '@/lib/supabase/admin') return { createAdminClient: () => assert.fail('A rejected purchase reached the database') }
    assert.equal(path, '@apple/app-store-server-library', 'A rejected purchase must never reach the database')
    return require(path)
  }
  new Function('require', 'module', 'exports', source.text)(fixtureRequire, fixture, fixture.exports)
  return fixture.exports
}
const { storeKitEnvironmentAllowed } = loadFixture<typeof import('../src/lib/storeKitEntitlements')>('storeKitEntitlements')
const { readSignedStoreKitBody, redeemStoreKitTransaction, storeKitError } =
  loadFixture<typeof import('../src/lib/storeKitSignedData')>('storeKitSignedData')

const designatedTester = '11111111-1111-4111-8111-111111111111'
const otherAccount = '22222222-2222-4222-8222-222222222222'

test('a sandbox receipt can be submitted only by the designated QA account', async (t) => {
  const production = process.env.SLIPSURGE_STOREKIT_PRODUCTION
  const sandbox = process.env.SLIPSURGE_STOREKIT_SANDBOX_USERS
  t.after(() => {
    if (production === undefined) delete process.env.SLIPSURGE_STOREKIT_PRODUCTION
    else process.env.SLIPSURGE_STOREKIT_PRODUCTION = production
    if (sandbox === undefined) delete process.env.SLIPSURGE_STOREKIT_SANDBOX_USERS
    else process.env.SLIPSURGE_STOREKIT_SANDBOX_USERS = sandbox
  })
  delete process.env.SLIPSURGE_STOREKIT_PRODUCTION
  process.env.SLIPSURGE_STOREKIT_SANDBOX_USERS = designatedTester
  assert.equal(storeKitEnvironmentAllowed('Production', designatedTester), false)
  assert.equal(storeKitEnvironmentAllowed('Sandbox', designatedTester), true)
  assert.equal(storeKitEnvironmentAllowed('Sandbox', otherAccount), false)

  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const forged = `${encoded({ alg: 'ES256' })}.${encoded({
    environment: 'Sandbox', appAccountToken: designatedTester, bundleId: 'com.slipsurge.ios',
    productId: 'com.slipsurge.ios.ultimate.monthly',
  })}.forged`
  await assert.rejects(redeemStoreKitTransaction(forged, otherAccount), error => storeKitError(error).status === 403)
  await assert.rejects(redeemStoreKitTransaction(forged, designatedTester), error => storeKitError(error).status === 400)
})

test('invalid and oversized bodies fail before Apple verification', async () => {
  const request = (body: string) => new Request('https://example.test/storekit', { method: 'POST', body })
  await assert.rejects(readSignedStoreKitBody(request('{"signedTransaction": "bad"}'), 'signedTransaction'),
    error => storeKitError(error).status === 400)
  await assert.rejects(readSignedStoreKitBody(request(JSON.stringify({ signedTransaction: 'a'.repeat(25_001) })), 'signedTransaction'),
    error => storeKitError(error).status === 413)
})
