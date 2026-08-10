import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = file => readFile(path.join(root, file), 'utf8')

test('desktop updater configuration is production-safe', async () => {
  const config = JSON.parse(await read('desktop/src-tauri/tauri.conf.json'))
  const cargo = await read('desktop/src-tauri/Cargo.toml')
  const capability = JSON.parse(await read('desktop/src-tauri/capabilities/main.json'))
  assert.equal(cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1], config.version)
  assert.match(config.plugins.updater.endpoints[0], /^https:\/\/www\.slipsurge\.com\/api\/desktop\/update\//)
  assert.ok(config.plugins.updater.pubkey.length > 40)
  assert.deepEqual(capability.remote.urls, ['https://www.slipsurge.com/*'])
})

test('production web security headers remain enabled', async () => {
  const source = await read('next.config.ts')
  for (const header of ['Strict-Transport-Security', 'X-Content-Type-Options', 'Permissions-Policy', 'Referrer-Policy']) {
    assert.ok(source.includes(header), `${header} is missing`)
  }
})

test('critical pipelines write health telemetry', async () => {
  const vercel = JSON.parse(await read('vercel.json'))
  const jobs = [...new Set(vercel.crons.map(cron => cron.path.split('?')[0].split('/').at(-1)))]
  const registry = await read('src/lib/pipelineRegistry.ts')
  for (const job of jobs) {
    const source = await read(`src/app/api/cron/${job}/route.ts`)
    assert.ok(source.includes(`withPipelineHealth('${job}', run)`), `${job} is not instrumented`)
    assert.ok(registry.includes(`name: '${job}'`), `${job} is missing from the admin health registry`)
  }
})

test('desktop notifications include realtime and reconnect catch-up', async () => {
  const source = await read('src/components/desktop/DesktopExperience.tsx')
  assert.ok(source.includes(".on('postgres_changes'"))
  assert.ok(source.includes(".gt('created_at', cursor)"))
  assert.ok(source.includes("window.addEventListener('focus', resume)"))
})

test('private account fields are not exposed through public profile reads', async () => {
  const columns = await read('src/lib/supabase/userColumns.ts')
  const auth = await read('src/context/AuthContext.tsx')
  const accountRoute = await read('src/app/api/account/me/route.ts')
  for (const privateField of ['email', 'stripe_customer_id', 'whop_membership_id', 'notification_settings']) {
    const publicSection = columns.split('export const PRIVATE_ACCOUNT_COLUMNS')[0]
    assert.ok(!publicSection.includes(`'${privateField}'`), `${privateField} leaked into public user columns`)
  }
  assert.ok(auth.includes("fetch('/api/account/me'"))
  assert.ok(accountRoute.includes("'Cache-Control': 'private, no-store"))
})

test('privileged user fields and notification writes are server controlled', async () => {
  const notificationPolicy = await read('supabase/migrations/20260810112000_notification_insert_hardening.sql')
  const registration = await read('src/app/auth/register/page.tsx')
  const bootstrap = await read('src/app/api/account/bootstrap/route.ts')
  assert.ok(!registration.includes("from('users').upsert"))
  assert.ok(bootstrap.includes('createAdminClient()'))
  assert.ok(notificationPolicy.includes('actor_id = (select auth.uid())'))
  assert.ok(notificationPolicy.includes('user_id <> (select auth.uid())'))
})

test('sensitive admin surfaces require enrolled MFA at aal2', async () => {
  const middleware = await read('src/lib/supabase/middleware.ts')
  const layout = await read('src/app/admin/layout.tsx')
  assert.ok(middleware.includes("request.nextUrl.pathname.startsWith('/api/admin/')"))
  assert.ok(middleware.includes("assurance?.nextLevel === 'aal2'"))
  assert.ok(middleware.includes("code: 'MFA_REQUIRED'"))
  assert.ok(layout.includes("redirect('/settings/security?next=/admin')"))
})

test('billing webhooks are retry-safe and deliveries are observable', async () => {
  const stripe = await read('src/app/api/stripe/webhook/route.ts')
  const whop = await read('src/lib/whopWebhook.ts')
  const push = await read('src/app/api/push/send/route.ts')
  const email = await read('src/app/api/email/send-notification/route.ts')
  for (const source of [stripe, whop]) {
    assert.ok(source.includes("from('provider_webhook_events')"))
    assert.ok(source.includes("status: 'succeeded'"))
  }
  assert.ok(push.includes("from('notification_delivery_attempts')"))
  assert.ok(push.includes("skipped: 'push already delivered'"))
  assert.ok(email.includes("channel: 'email'"))
  assert.ok(email.includes("skipped: 'email already delivered'"))
})

test('privacy requests and moderation actions are server controlled', async () => {
  const exportRoute = await read('src/app/api/account/data-export/route.ts')
  const deletionRoute = await read('src/app/api/account/deletion/route.ts')
  const reportRoute = await read('src/app/api/admin/reports/[reportId]/route.ts')
  const auditMigration = await read('supabase/migrations/20260810110000_admin_audit_and_moderation.sql')
  assert.ok(exportRoute.includes("from('data_export_requests')"))
  assert.ok(deletionRoute.includes("from('account_deletion_requests')"))
  assert.ok(reportRoute.includes('writeAdminAudit'))
  assert.ok(auditMigration.includes('revoke all on table public.admin_audit_logs from anon, authenticated'))
})

test('release workflow validates before publishing', async () => {
  const workflow = await read('../.github/workflows/desktop-release.yml')
  const typecheck = workflow.indexOf('npm run typecheck')
  const smoke = workflow.indexOf('npm run test:production')
  const publish = workflow.indexOf('npm run desktop:publish-update')
  assert.ok(typecheck >= 0 && smoke > typecheck && publish > smoke)
  assert.ok(workflow.includes("github.ref == 'refs/heads/main'"))
})
