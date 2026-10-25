import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { validateProductionAuditReport, verifySecurityBackports } from './verify-security-backports.mjs'

const require = createRequire(import.meta.url)
const forge = require('node-forge')

test('production audit cannot certify empty, malformed or failed registry responses', () => {
  const clean = { vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } }
  assert.deepEqual(validateProductionAuditReport(clean, 0), {})
  for (const [report, code] of [[{}, 0], [{ vulnerabilities: [] }, 0], [{ vulnerabilities: {} }, 1], [clean, null], [clean, 2], [{ ...clean, metadata: { vulnerabilities: {} } }, 0]]) {
    assert.throws(() => validateProductionAuditReport(report, code), /npm audit returned/)
  }
})

test('security gate rejects modified backports and newly nested vulnerable copies', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  await verifySecurityBackports(root)
  const fixture = await mkdtemp(join(tmpdir(), 'slipsurge-security-'))
  try {
    const manifest = JSON.parse(await readFile(join(root, 'scripts/security-backports.json'), 'utf8'))
    const paths = ['scripts/security-backports.json', 'package-lock.json', ...Object.entries(manifest.packages).flatMap(([path, entry]) => [`${path}/package.json`, ...Object.keys(entry.files).map(file => `${path}/${file}`)])]
    for (const path of paths) {
      await mkdir(dirname(join(fixture, path)), { recursive: true })
      await writeFile(join(fixture, path), await readFile(join(root, path)))
    }
    await verifySecurityBackports(fixture)
    const target = 'node_modules/node-forge/lib/rsa.js'
    await writeFile(join(fixture, target), '// missing security guard')
    await assert.rejects(verifySecurityBackports(fixture), /hash mismatch/)
    await writeFile(join(fixture, target), await readFile(join(root, target)))
    const lock = JSON.parse(await readFile(join(fixture, 'package-lock.json'), 'utf8'))
    lock.packages['node_modules/example/node_modules/zod'] = { version: '3.25.76' }
    await writeFile(join(fixture, 'package-lock.json'), JSON.stringify(lock))
    await assert.rejects(verifySecurityBackports(fixture), /inventory differs/)
  } finally {
    const relativeFixture = relative(resolve(tmpdir()), resolve(fixture))
    assert.ok(!isAbsolute(relativeFixture) && !relativeFixture.includes(sep) && relativeFixture.startsWith('slipsurge-security-'), 'temporary cleanup must stay inside the expected test directory')
    await rm(fixture, { recursive: true, force: true })
  }
})

test('RSA verification rejects extra nested DigestAlgorithm children, preserving valid SHA-256 signatures', () => {
  const pem = generateKeyPairSync('rsa', { modulusLength: 1024, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'pkcs1', format: 'pem' } })
  const key = forge.pki.privateKeyFromPem(pem.privateKey)
  const publicKey = forge.pki.publicKeyFromPem(pem.publicKey)
  const md = forge.md.sha256.create().update('local RSA structure regression')
  const digest = md.digest().getBytes()
  assert.equal(publicKey.verify(digest, key.sign(md)), true)
  const { asn1 } = forge
  const make = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value)
  const oid = () => make(asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes())
  const nil = () => make(asn1.Type.NULL, false, '')
  const signature = (children) => key.sign(asn1.toDer(make(asn1.Type.SEQUENCE, true, [
    make(asn1.Type.SEQUENCE, true, children), make(asn1.Type.OCTETSTRING, false, digest),
  ])).getBytes(), 'NONE')
  assert.equal(publicKey.verify(digest, signature([oid()])), true)
  assert.equal(publicKey.verify(digest, signature([oid(), nil()])), true)
  assert.throws(() => publicKey.verify(digest, signature([oid(), nil(), nil()])), /valid RSASSA-PKCS1-v1_5 DigestInfo/)
  assert.throws(() => publicKey.verify(digest, signature([oid(), nil(), make(asn1.Type.OCTETSTRING, false, 'extra')])) , /valid RSASSA-PKCS1-v1_5 DigestInfo/)
})

for (const pkg of ['../node_modules/zod', '../node_modules/expo/node_modules/zod']) {
  for (const suffix of ['v3/index.cjs', 'v3/index.js']) {
    test(`${pkg}/${suffix}: bounded collections abort before element evaluation; ordinary parsing remains valid`, async () => {
      const url = new URL(`${pkg}/${suffix}`, import.meta.url)
      const z = suffix.endsWith('.cjs') ? require(fileURLToPath(url)) : await import(url.href)
      let calls = 0
      const value = z.number().transform(n => { calls++; return n + 1 })
      const oversized = [1, 2, 3, 4]
      for (const schema of [z.array(value).max(2), z.array(value).length(2)]) {
        calls = 0
        const result = schema.safeParse(oversized)
        assert.equal(result.success, false)
        assert.equal(result.error.issues[0].code, 'too_big')
        assert.equal(calls, 0)
        assert.equal((await schema.safeParseAsync(oversized)).success, false)
        assert.equal(calls, 0)
        assert.deepEqual(schema.parse([1, 2]), [2, 3])
      }
      for (const schema of [z.set(value).max(2), z.set(value).size(2)]) {
        calls = 0
        assert.equal(schema.safeParse(new Set(oversized)).success, false)
        assert.equal(calls, 0)
        assert.equal((await schema.safeParseAsync(new Set(oversized))).success, false)
        assert.equal(calls, 0)
        assert.deepEqual([...schema.parse(new Set([1, 2]))], [2, 3])
      }
      calls = 0
      assert.deepEqual(z.array(value).parse(oversized), [2, 3, 4, 5])
      assert.equal(calls, 4)
      assert.equal(z.array(value).max(2).safeParse('invalid').success, false)
      assert.equal(z.array(value).min(2).safeParse([]).error.issues[0].code, 'too_small')
    })
  }
}

for (const pkg of ['../node_modules/zod', '../node_modules/expo/node_modules/zod']) {
 for (const suffix of ['v4/index.cjs', 'v4/index.js', 'v4/mini/index.cjs', 'v4/mini/index.js']) {
  test(`${pkg}/${suffix}: array/map/set bounds reject early and preserve check order`, async () => {
    const url = new URL(`${pkg}/${suffix}`, import.meta.url)
    const z = suffix.endsWith('.cjs') ? require(fileURLToPath(url)) : await import(url.href)
    let calls = 0
    const value = z.number().check(z.refine(() => { calls++; return true }))
    const fixtures = [
      [z.array(value).check(z.maxLength(2)), [1, 2, 3], [1, 2]],
      [z.array(value).check(z.length(2)), [1, 2, 3], [1, 2]],
      [z.set(value).check(z.maxSize(2)), new Set([1, 2, 3]), new Set([1, 2])],
      [z.set(value).check(z.size(2)), new Set([1, 2, 3]), new Set([1, 2])],
      [z.map(value, value).check(z.maxSize(2)), new Map([[1, 1], [2, 2], [3, 3]]), new Map([[1, 1]])],
    ]
    for (const [schema, oversized, valid] of fixtures) {
      calls = 0
      const result = z.safeParse(schema, oversized)
      assert.equal(result.success, false)
      assert.equal(result.error.issues[0].code, 'too_big')
      assert.equal(calls, 0)
      assert.equal((await z.safeParseAsync(schema, oversized)).success, false)
      assert.equal(calls, 0)
      assert.deepEqual(z.parse(schema, valid), valid)
    }
    const shrink = z.array(z.number()).check(z.overwrite(a => a.slice(0, 1)), z.maxLength(1))
    assert.deepEqual(z.parse(shrink, [1, 2, 3]), [1])
    let laterCalls = 0
    const blocked = z.array(value).check(z.maxLength(1), z.refine(() => { laterCalls++; return true }))
    calls = 0
    assert.equal(z.safeParse(blocked, [1, 2, 3]).success, false)
    assert.equal(calls, 0)
    assert.equal(laterCalls, 0)
    assert.equal(z.safeParse(z.array(value).check(z.maxLength(1)), 'bad').success, false)
  })
 }
}
