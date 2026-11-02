import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'

test('canceling-membership payment alert asks to review timing without asserting charge order', async () => {
  const source = await readFile(new URL('../src/lib/billingAlert.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const emails = [], alerts = []
  const imports = {
    '@/lib/discord': { postAlert: async (_db, _kind, payload) => { alerts.push(payload) } },
    '@/lib/email': { brandedEmailHtml: args => args.bodyHtml, sendEmail: async args => { emails.push(args); return true } },
  }
  const mod = { exports: {} }
  new Function('require', 'exports', 'console', output)(name => { assert.ok(imports[name]); return imports[name] }, mod.exports, { error() {} })
  const admin = { from: () => ({ select: () => ({ eq: async () => ({ data: [{ email: 'admin@example.test' }] }) }) }) }
  await mod.exports.alertPaymentOnCancelingMembership(admin, { userId: 'member', email: null, membershipId: 'mem_test', planTier: 'ultimate' })
  assert.equal(emails.length, 1)
  assert.equal(alerts.length, 1)
  const text = `${emails[0].subject} ${emails[0].text} ${emails[0].html} ${JSON.stringify(alerts[0])}`
  assert.match(text, /review (?:the )?payment and cancellation times/i)
  assert.doesNotMatch(text, /charged.*after cancel|despite.*cancel|may need a refund/i)
})
