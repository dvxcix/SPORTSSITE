import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { isVerifiedNotificationRecipient } from '../src/lib/verifiedNotificationRecipient.ts'

const source = await readFile(new URL('../src/app/api/email/send-notification/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function fixture(authEmail: string | null, confirmed = true, authError: unknown = null) {
  let sends = 0
  const admin = {
    auth: { admin: { getUserById: async () => ({ data: { user: { id: 'owner', email: authEmail, email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : null } }, error: authError }) } },
    from(table: string) {
      if (table === 'notifications') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: '00000000-0000-4000-8000-000000000001', user_id: 'owner', type: 'new_pick', message: 'A new pick', actor: null, data: {}, link: '/feed' } }) }) }) }
      if (table === 'users') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: 'old@example.com', notification_settings: { new_pick_email: true }, notification_delivery_settings: {} } }) }) }) }
      if (table === 'notification_delivery_attempts') return { select: () => ({ eq: () => ({ eq: () => ({ or: async () => ({ count: 0 }) }) }) }), insert: async () => ({ error: null }) }
      throw new Error(`Unexpected table ${table}`)
    },
  }
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/notify': { SETTINGS_KEY_BY_TYPE: { new_pick: 'new_pick' } },
    '@/lib/requestAuth': { hasBearerSecret: () => true },
    '@/lib/safeRedirect': { safeInternalPath: (value: string) => value },
    '@/lib/email': { brandedEmailHtml: () => '', sendEmailWithResult: async () => { sends++; return { ok: true, status: 200, id: 'provider-message' } } },
    '@/lib/notificationDelivery': { shouldSuppressNotificationDelivery: () => false },
    '@/lib/verifiedNotificationRecipient': { isVerifiedNotificationRecipient },
  }
  const mod = { exports: {} as { POST: (request: Request) => Promise<Response> } }
  new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
  return { post: () => mod.exports.POST(new Request('https://example.com/api/email/send-notification', { method: 'POST', body: JSON.stringify({ notification_id: '00000000-0000-4000-8000-000000000001' }) })), sends: () => sends }
}

test('mismatch, unconfirmed address and auth outage never invoke the sender', async () => {
  const old = process.env.PUSH_TRIGGER_SECRET; process.env.PUSH_TRIGGER_SECRET = 'test-only'
  try {
    for (const f of [fixture('new@example.com'), fixture('old@example.com', false), fixture('old@example.com', true, { status: 503 })]) {
      const response = await f.post()
      assert.equal(response.status, 503); assert.equal(f.sends(), 0)
      assert.doesNotMatch(await response.text(), /old@example\.com|new@example\.com/)
    }
  } finally { if (old === undefined) delete process.env.PUSH_TRIGGER_SECRET; else process.env.PUSH_TRIGGER_SECRET = old }
})

test('a matching verified address retains the existing send behavior', async () => {
  const old = process.env.PUSH_TRIGGER_SECRET; process.env.PUSH_TRIGGER_SECRET = 'test-only'
  try { const f = fixture('old@example.com'); assert.equal((await f.post()).status, 200); assert.equal(f.sends(), 1) }
  finally { if (old === undefined) delete process.env.PUSH_TRIGGER_SECRET; else process.env.PUSH_TRIGGER_SECRET = old }
})
