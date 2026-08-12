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

test('public discovery files bypass the authenticated request proxy', async () => {
  const proxy = await read('src/proxy.ts')
  for (const route of ['manifest.webmanifest', 'robots.txt', 'sitemap.xml']) {
    assert.ok(proxy.includes(route), `${route} is not excluded from the authenticated proxy`)
  }
})

test('public discovery and authentication boundaries stay aligned', async () => {
  const middleware = await read('src/lib/supabase/middleware.ts')
  const sitemap = await read('src/app/sitemap.ts')
  assert.ok(middleware.includes("'/creators/apply'"), 'creator acquisition page is not public')
  assert.ok(sitemap.includes("path: '/creators/apply'"), 'creator acquisition page is missing from discovery')
  assert.ok(middleware.includes("pathname === '/creators'"), 'creator marketplace is not public')
  assert.ok(middleware.includes("pathname === '/blog'"), 'published editorial content is not public')
  assert.ok(sitemap.includes("path: '/creators'"), 'creator marketplace is missing from discovery')
  assert.ok(sitemap.includes("path: '/blog'"), 'blog is missing from discovery')
  for (const privateRoute of ['/explore', '/sports', '/leaderboard']) {
    assert.ok(!sitemap.includes(`path: '${privateRoute}'`), `${privateRoute} should not be advertised while auth-gated`)
  }
  for (const privateCreatorRoute of ['studio', 'payouts']) {
    assert.ok(middleware.includes(`!['studio', 'payouts'].includes(creatorSlug)`), `${privateCreatorRoute} must remain protected`)
  }
})

test('root failures retain a branded recovery path', async () => {
  const globalError = await read('src/app/global-error.tsx')
  const segmentError = await read('src/app/error.tsx')
  assert.ok(globalError.includes('<html lang="en">'))
  assert.ok(globalError.includes('onClick={reset}'))
  assert.ok(!segmentError.includes("console.error('SlipSurge page error', error)"))
})

test('expected unpublished NFL data does not poison pipeline health', async () => {
  const route = await read('src/app/api/cron/nfl-sync-pbp/route.ts')
  const sync = await read('src/lib/nflverseSync.ts')
  assert.ok(sync.includes('export class NflverseAssetError'))
  assert.ok(sync.includes('export function isNflverseAssetError'))
  assert.ok(route.includes('isNflverseAssetError(e, 404)'))
  assert.ok(route.includes("skipped: 'upstream_not_published'"))
})

test('Browserbase routes include Playwright runtime assets', async () => {
  const config = await read('next.config.ts')
  for (const route of [
    '/api/admin/pikkit-context',
    '/api/cron/poll-pikkit-picks',
    '/api/cron/scrape-fanduel',
    '/api/cron/scrape-mgm',
    '/api/cron/scrape-pikkit',
  ]) {
    assert.ok(config.includes(`'${route}': ['./node_modules/playwright-core/**/*']`), `${route} must trace Playwright assets`)
  }
})

test('decorative animation values are deterministic during render', async () => {
  const meteors = await read('src/components/ui/meteors.tsx')
  const beams = await read('src/components/ui/background-beams.tsx')
  assert.ok(!meteors.includes('Math.random()'))
  assert.ok(!beams.includes('Math.random()'))
})

test('contextual tooltips remain portaled, branded, and touch-safe', async () => {
  const tooltip = await read('src/components/ui/tooltip-card.tsx')
  const styles = await read('src/app/globals.css')
  const layout = await read('src/app/layout.tsx')
  const dugout = await read('src/components/dugout/DugoutClient.tsx')
  assert.ok(tooltip.includes('createPortal('), 'tooltips can be clipped by page overflow')
  assert.ok(tooltip.includes('<BookLogo'), 'sportsbook context is missing from tooltip visuals')
  assert.ok(tooltip.includes('ss-tooltip-team-mark'), 'team logos are missing from tooltip visuals')
  assert.ok(styles.includes('.ss-tooltip-art.is-image { overflow: visible;'), 'sportsbook badges are clipped by player portraits')
  assert.match(styles, /\.ss-tooltip-book-badge[\s\S]*?border-radius: 50%/, 'sportsbook badges must remain circular')
  assert.ok(tooltip.includes('MutationObserver'), 'legacy title attributes are not upgraded')
  assert.ok(tooltip.includes('role="tooltip"'), 'tooltip semantics are missing')
  assert.ok(!tooltip.includes('onTouchStart='), 'tooltips must not intercept mobile actions')
  assert.ok(layout.includes('<NativeTooltipProvider />'), 'the global tooltip provider is not mounted')
  assert.ok(dugout.includes("kind: 'market'"), 'TheDugout odds cells lack market context')
  assert.ok(dugout.includes('mlbHeadshot(row.mlb_id)'), 'TheDugout odds tooltips lack player imagery')
  assert.ok(dugout.includes("team: teamLogo ? { logo: teamLogo, label: row.team } : null"), 'TheDugout odds tooltips lack team logos')
})

test('onboarding completion performs one durable handoff to the feed', async () => {
  const onboarding = await read('src/components/onboarding/OnboardingFlow.tsx')
  assert.ok(onboarding.includes("window.location.replace('/feed')"), 'completed onboarding must hard-navigate to the feed')
  assert.ok(onboarding.includes("keepalive: true"), 'welcome notification should survive the document navigation')
  assert.ok(!/^\s*router\.push\('\/feed'\)/m.test(onboarding), 'onboarding must not start a competing client navigation')
  assert.ok(!/^\s*router\.refresh\(\)/m.test(onboarding), 'onboarding must not race a refresh against its redirect')
})

test('critical pipelines write health telemetry', async () => {
  const vercel = JSON.parse(await read('vercel.json'))
  const jobs = [...new Set(vercel.crons.map(cron => cron.path.split('?')[0].split('/').at(-1)))]
  const registry = await read('src/lib/pipelineRegistry.ts')
  for (const job of jobs) {
    const source = await read(`src/app/api/cron/${job}/route.ts`)
    assert.match(source, new RegExp(`withPipelineHealth\\('${job}', run(?:,|\\))`), `${job} is not instrumented`)
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
  for (const privateField of ['email', 'whop_connected_company_id', 'whop_membership_id', 'notification_settings']) {
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

test('Whop billing is retry-safe, exclusive, and deliveries are observable', async () => {
  const whop = await read('src/lib/whopWebhook.ts')
  const mainWebhook = await read('src/app/api/webhooks/whop/route.ts')
  const addonWebhook = await read('src/app/api/webhooks/whop-addon/route.ts')
  const onboarding = await read('src/app/api/creator/whop-onboard/route.ts')
  const products = await read('src/app/api/creator/products/route.ts')
  const payouts = await read('src/app/api/creator/payout-token/route.ts')
  const pkg = JSON.parse(await read('package.json'))
  const push = await read('src/app/api/push/send/route.ts')
  const email = await read('src/app/api/email/send-notification/route.ts')
  assert.ok(whop.includes("from('provider_webhook_events')"))
  assert.ok(whop.includes("status: 'succeeded'"))
  assert.ok(whop.includes("'payment.created'"))
  assert.ok(whop.includes("'withdrawal.updated'"))
  assert.ok(!whop.includes('JSON.stringify(event)'))
  assert.ok(mainWebhook.includes("process.env.WHOP_WEBHOOK_KEY, 'main'"))
  assert.ok(addonWebhook.includes("process.env.ADDON_WHOP_WEBHOOK, 'addon'"))
  assert.ok(onboarding.includes('WHOP_OPERATION_TIMEOUT_MS'))
  assert.ok(onboarding.includes('safeProviderError(error)'))
  assert.ok(!onboarding.includes("error instanceof Error ? error.message"))
  assert.ok(onboarding.includes('accountLinks.create'))
  assert.ok(products.includes('checkoutConfigurations.create'))
  assert.ok(payouts.includes('accessTokens.create'))
  assert.ok(payouts.includes('export async function POST()'))
  assert.ok(payouts.includes('WHOP_OPERATION_TIMEOUT_MS'))
  assert.ok(payouts.includes('safeProviderError(error)'))
  assert.ok(!payouts.includes("error instanceof Error ? error.message"))
  assert.equal(pkg.dependencies?.stripe, undefined)
  assert.equal(pkg.dependencies?.['@stripe/stripe-js'], undefined)
  for (const removedFile of [
    'src/lib/stripe.ts',
    'src/app/api/stripe/webhook/route.ts',
    'src/app/api/checkout/pro-plan/route.ts',
    'src/app/api/checkout/creator/route.ts',
    'src/app/api/creator/connect-onboard/route.ts',
  ]) {
    await assert.rejects(read(removedFile), `${removedFile} should not exist`)
  }
  assert.ok(push.includes("from('notification_delivery_attempts')"))
  assert.ok(push.includes("skipped: 'push already delivered'"))
  assert.ok(email.includes("channel: 'email'"))
  assert.ok(email.includes("skipped: 'email already accepted by provider'"))
})

test('Resend email delivery is signed, retry-safe, and observable', async () => {
  const middleware = await read('src/lib/supabase/middleware.ts')
  const sender = await read('src/lib/email.ts')
  const notification = await read('src/app/api/email/send-notification/route.ts')
  const webhook = await read('src/app/api/webhooks/resend/route.ts')
  const migration = await read('supabase/migrations/20260811220000_email_delivery_lifecycle.sql')
  assert.ok(middleware.includes("request.nextUrl.pathname === '/api/webhooks/resend'"))
  assert.ok(sender.includes("'Idempotency-Key'"))
  assert.ok(sender.includes('AbortSignal.timeout(15_000)'))
  assert.ok(notification.includes('provider_message_id'))
  assert.ok(notification.includes('notification/${notification.id}'))
  assert.ok(webhook.includes("new Webhook(secret).verify(rawBody"))
  assert.ok(webhook.includes("from('provider_webhook_events')"))
  assert.ok(webhook.includes("'email.complained'"))
  assert.ok(!webhook.includes('JSON.stringify(event)'))
  assert.ok(migration.includes('provider_message_id text'))
})

test('billing reconciliation is bounded and avoids unchanged side effects', async () => {
  const fetcher = await read('src/lib/whopMembershipsFetch.ts')
  const main = await read('src/lib/whopMainReconcile.ts')
  const addon = await read('src/lib/whopAddonReconcile.ts')
  assert.ok(fetcher.includes('AbortSignal.timeout(REQUEST_TIMEOUT_MS)'))
  assert.ok(fetcher.includes('await Promise.all(pageRequests)'))
  assert.ok(fetcher.includes('Whop memberships pagination failed'))
  assert.ok(main.includes('if (unchanged) continue'))
  assert.ok(main.includes('if (accessChanged)'))
  assert.ok(main.includes('stopped before writes'))
  assert.ok(addon.includes('const bestByUser = new Map'))
  assert.ok(addon.includes('if (unchanged) continue'))
  assert.ok(addon.includes('if (accessChanged)'))
})

test('authentication return paths remain same-origin and provider errors stay private', async () => {
  const safeRedirect = await read('src/lib/safeRedirect.ts')
  const callback = await read('src/app/auth/callback/route.ts')
  const login = await read('src/app/auth/login/page.tsx')
  const whopLogin = await read('src/app/auth/whop/login/route.ts')
  const whopCallback = await read('src/app/auth/whop/callback/route.ts')
  const whopComplete = await read('src/app/auth/whop/complete/page.tsx')
  const whop = await read('src/lib/whop.ts')
  assert.ok(safeRedirect.includes("parsed.origin !== INTERNAL_ORIGIN"))
  for (const source of [callback, login, whopLogin, whopCallback, whopComplete]) {
    assert.ok(source.includes('safeInternalPath'), 'OAuth flow does not sanitize its return target')
  }
  assert.ok(!callback.includes("failUrl.searchParams.set('link_error', error.message)"))
  assert.ok(!whop.includes('body: errBody'))
  assert.ok(!whop.includes('error: errBody'))
  assert.ok(whop.includes('AbortSignal.timeout(WHOP_FETCH_TIMEOUT_MS)'))
})

test('third-party AI generation is validated, bounded, and rate limited', async () => {
  const route = await read('src/app/api/ai/blog/route.ts')
  const limiter = await read('src/lib/serverRateLimit.ts')
  const migration = await read('supabase/migrations/20260811180000_server_rate_limit.sql')
  const atomicMigration = await read('supabase/migrations/20260811190000_atomic_rate_limits.sql')
  const featureMigration = await read('supabase/migrations/20260811230000_allow_underscore_server_rate_features.sql')
  assert.ok(route.includes("consumeServerRateLimit(gate.userId!, 'ai-blog', 10, 3600)"))
  assert.ok(route.includes('AbortSignal.timeout(AI_TIMEOUT_MS)'))
  assert.ok(route.includes("prompt.trim().slice(0, 500)"))
  assert.ok(limiter.includes("rpc('consume_server_rate_limit'"))
  assert.ok(migration.includes("auth.role() <> 'service_role'"))
  assert.ok(migration.includes('revoke all on function public.consume_server_rate_limit'))
  assert.ok(atomicMigration.includes('on conflict (key) do update'))
  assert.ok(atomicMigration.includes('least(counters.count + 1, p_max + 1)'))
  assert.ok(featureMigration.includes("p_feature !~ '^[a-z0-9_-]{2,40}$'"))
  assert.ok(limiter.includes('SERVER_RATE_LIMIT_FEATURE'))
})

test('Whop billing retries are bounded without breaking idempotency or legacy account links', async () => {
  const checkout = await read('src/app/api/whop/checkout-session/route.ts')
  const cancel = await read('src/app/api/whop/cancel-membership/route.ts')
  const addonReconcile = await read('src/lib/whopAddonReconcile.ts')
  const mainReconcile = await read('src/lib/whopMainReconcile.ts')
  const membershipAccess = await read('src/lib/whopMembershipAccess.ts')
  const webhook = await read('src/lib/whopWebhook.ts')
  const whop = await read('src/lib/whop.ts')
  const cancelRoute = await read('src/app/api/whop/cancel-membership/route.ts')
  assert.ok(checkout.includes("consumeServerRateLimit(user.id, 'whop_checkout', 12, 5 * 60)"))
  assert.ok(checkout.includes("'Retry-After': '300'"))
  assert.ok(cancel.indexOf('if (profile.tier_cancel_at_period_end)') < cancel.indexOf("consumeServerRateLimit(user.id, 'whop_cancel'"))
  assert.ok(cancel.includes('alreadyScheduled: true'))
  assert.ok(cancel.includes("consumeServerRateLimit(user.id, 'whop_cancel', 10, 5 * 60)"))
  for (const reconcile of [addonReconcile, mainReconcile]) {
    assert.ok(reconcile.includes('linkedOwnerByMembershipId'))
    assert.ok(reconcile.includes("select('id, whop_membership_id')"))
    assert.ok(reconcile.includes('whopMembershipGrantsAccess'))
    assert.ok(reconcile.includes('tier_cancel_at_period_end'))
  }
  assert.ok(whop.includes("cancellation_mode: immediate ? 'immediate' : 'at_period_end'"))
  assert.ok(membershipAccess.includes("['active', 'valid', 'trialing', 'canceling', 'past_due', 'completed']"))
  assert.ok(membershipAccess.includes('whopCancellationKeepsAccess'))
  assert.ok(webhook.includes("tier_status: 'canceling'"))
  assert.ok(webhook.includes("data.cancel_at_period_end !== false || current.tier_cancel_at_period_end === true"))
  assert.ok(cancelRoute.indexOf("tier_status: 'canceling'") < cancelRoute.indexOf('cancelWhopMembership('))
  assert.ok(cancelRoute.includes("tier_status: 'active'"))
})

test('pipeline telemetry records starts before handlers can time out', async () => {
  const health = await read('src/lib/pipelineHealth.ts')
  const admin = await read('src/app/admin/pipeline-health/page.tsx')
  assert.ok(health.indexOf("status: 'running'") < health.indexOf('await handler(request)'))
  assert.ok(health.includes(".update({"))
  assert.ok(admin.includes("? 'timed_out'"))
  assert.ok(admin.includes("? 'Timed out'"))
})

test('database RPCs and reaction notifications are least privilege', async () => {
  const base = await read('supabase/migrations/20260811160000_production_security_hardening.sql')
  const rpc = await read('supabase/migrations/20260811170000_rpc_surface_hardening.sql')
  const grants = await read('supabase/migrations/20260811200000_service_table_grants.sql')
  const social = await read('supabase/migrations/20260811210000_server_only_social_transactions.sql')
  const postCard = await read('src/components/social/PostCardClient.tsx')
  assert.ok(base.includes('revoke execute on function public.apply_leg_result_to_post'))
  assert.ok(base.includes('to service_role'))
  assert.ok(rpc.includes('alter function public.check_rate_limit(text, integer, integer) set schema private'))
  assert.ok(rpc.includes('v_post_owner is distinct from p_user_id'))
  assert.ok(rpc.includes("target_type = 'post' and emoji = p_emoji"))
  assert.ok(rpc.includes('revoke all on function public.notify_reaction'))
  assert.ok(social.includes('security invoker'))
  assert.ok(social.includes('revoke all on function public.cast_poll_vote(uuid, integer) from public, anon, authenticated'))
  assert.ok(social.includes('revoke all on function public.notify_reaction(uuid, uuid, uuid, text) from public, anon, authenticated'))
  assert.ok(postCard.includes("fetch('/api/posts/poll-vote'"))
  assert.ok(postCard.includes("fetch('/api/posts/reaction-notification'"))
  for (const table of ['push_subscriptions', 'discord_config', 'rate_limit_counters', 'pro_plan_payout_runs', 'scrape_dispatch_queue']) {
    assert.ok(grants.includes(`revoke all on table public.${table} from anon, authenticated`), `${table} retains browser grants`)
  }
})

test('public blog views are atomic and remain server controlled', async () => {
  const page = await read('src/app/blog/[slug]/page.tsx')
  const migration = await read('supabase/migrations/20260811230000_atomic_blog_views.sql')
  assert.ok(page.includes("createAdminClient()"))
  assert.ok(page.includes("rpc('record_blog_view'"))
  assert.ok(!page.includes("from('blogs').update({ view_count"))
  assert.ok(migration.includes('set view_count = coalesce(view_count, 0) + 1'))
  assert.ok(migration.includes("status = 'published'"))
  assert.ok(migration.includes('revoke all on function public.record_blog_view(uuid) from public, anon, authenticated'))
  assert.ok(migration.includes('grant execute on function public.record_blog_view(uuid) to service_role'))
})

test('Ultimate-only Matrix tools do not call protected APIs for lower tiers', async () => {
  const matrixPanel = await read('src/components/dugout/CustomMatrixPanel.tsx')
  assert.ok(matrixPanel.includes('const hasUltimate = !!profile'))
  assert.ok(matrixPanel.includes('if (user && hasUltimate) refresh()'))
  assert.ok(matrixPanel.includes('if (!user || !hasUltimate) return null'))
})

test('provider-returned navigation remains on trusted Whop destinations', async () => {
  const validator = await read('src/lib/whopUrl.ts')
  const onboarding = await read('src/app/api/creator/whop-onboard/route.ts')
  const globalCheckout = await read('src/app/api/whop/checkout-session/route.ts')
  const creatorCheckout = await read('src/app/api/creator/products/[productId]/checkout/route.ts')
  const creatorStudio = await read('src/app/creators/studio/CreatorStudioClient.tsx')
  assert.ok(validator.includes("hostname.endsWith(`.${WHOP_ROOT_HOST}`)"))
  assert.ok(validator.includes("url.protocol === 'https:'"))
  assert.ok(onboarding.includes('isTrustedWhopUrl(link.url)'))
  assert.ok(globalCheckout.includes('isTrustedWhopUrl(data.purchase_url)'))
  assert.ok(creatorCheckout.includes('isTrustedWhopUrl(purchaseUrl)'))
  assert.ok(creatorStudio.includes('isTrustedWhopUrl(data?.url)'))
})

test('server-side upstream requests are time bounded', async () => {
  for (const file of [
    'src/app/api/dugout/data/route.ts',
    'src/app/api/admin/dugout-name-check/route.ts',
    'src/app/api/cron/dispatch-scrapes/route.ts',
    'src/lib/matrixBacktest.ts',
    'src/lib/playerSync.ts',
    'src/lib/statcastPitchLogSync.ts',
    'src/lib/weatherLab.ts',
  ]) {
    const source = await read(file)
    assert.ok(source.includes('AbortSignal.timeout('), `${file} has unbounded upstream requests`)
  }
})

test('external notification and media fallbacks remain resilient', async () => {
  const discord = await read('src/lib/discord.ts')
  const savant = await read('src/lib/savantSync.ts')
  const postImage = await read('src/app/api/share-image/[postId]/route.tsx')
  const watchlistImage = await read('src/app/api/share-image/watchlist/route.tsx')
  const webPushPatch = await read('patches/web-push+3.6.7.patch')
  const imageSizePatch = await read('patches/image-size+1.2.1.patch')
  const uuidPatch = await read('patches/uuid+7.0.3.patch')
  const packageJson = JSON.parse(await read('package.json'))
  const pushEndpoint = await read('src/lib/pushEndpoint.ts')
  const pushSubscribe = await read('src/app/api/push/subscribe/route.ts')
  const pushSend = await read('src/app/api/push/send/route.ts')
  const emailSend = await read('src/app/api/email/send-notification/route.ts')
  assert.ok(discord.includes('for (let attempt = 0; attempt < 4; attempt++)'))
  assert.ok(discord.includes('AbortSignal.timeout(12_000)'))
  assert.ok(discord.includes('await removeRole'))
  assert.ok(savant.includes('nonEmptyLines.length > 1'))
  assert.ok(!postImage.includes("favicon: '/sportsbook-logos/betrivers.ico'"))
  assert.ok(!watchlistImage.includes("favicon: '/sportsbook-logos/betrivers.ico'"))
  assert.ok(webPushPatch.includes('new URL(subscription.endpoint)'))
  assert.ok(webPushPatch.includes('urlParts.pathname + urlParts.search'))
  assert.equal(packageJson.scripts?.postinstall, 'patch-package')
  assert.equal(packageJson.scripts?.['audit:production'], 'node scripts/audit-production.mjs')
  assert.ok(imageSizePatch.includes('Invalid ICNS entry length'))
  assert.ok(imageSizePatch.includes('Invalid JXL box size'))
  assert.ok(uuidPatch.includes('Number.isSafeInteger(off)'))
  assert.ok(uuidPatch.includes('off + 16 > buf.length'))
  assert.ok(pushEndpoint.includes("url.protocol !== 'https:'"))
  assert.ok(pushEndpoint.includes("'.notify.windows.com'"))
  assert.ok(pushSubscribe.includes('isTrustedPushEndpoint(endpoint)'))
  assert.ok(pushSubscribe.includes("consumeServerRateLimit(user.id, 'push_subscription_mutation'"))
  assert.ok(pushSend.includes('invalidSubscriptions'))
  assert.ok(pushSend.includes("error: 'push delivery failed'"))
  assert.ok(pushSend.includes("safeInternalPath(notification.link, '/notifications')"))
  assert.ok(emailSend.includes("safeInternalPath(notification.link, '/notifications')"))
})

test('expired refresh tokens cannot pass protected requests through middleware', async () => {
  const middleware = await read('src/lib/supabase/middleware.ts')
  assert.ok(middleware.includes("pathname.startsWith('/api/')"))
  assert.ok(middleware.includes("code: 'SESSION_EXPIRED'"))
  assert.ok(middleware.includes("loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)"))
  assert.ok(!middleware.includes('return supabaseResponse // Allow request to proceed'))
})

test('service-role sports APIs authenticate mobile bearer requests themselves', async () => {
  for (const file of [
    'src/app/api/nfl/teams/[abbr]/route.ts',
    'src/app/api/nfl/players/[id]/route.ts',
    'src/app/api/search/nfl/route.ts',
    'src/app/api/allstar/data/route.ts',
  ]) {
    const source = await read(file)
    assert.ok(source.includes("requireTier('free')"), `${file} trusts the middleware bearer bypass without authenticating`)
  }
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

test('site switches share contained geometry and accessible labels', async () => {
  const sharedSwitch = await read('src/components/ui/Switch.tsx')
  assert.ok(sharedSwitch.includes("overflow: 'hidden'"))
  assert.ok(sharedSwitch.includes("boxSizing: 'border-box'"))
  assert.ok(sharedSwitch.includes('transform: `translateX('))
  assert.ok(sharedSwitch.includes('aria-label={ariaLabel'))

  for (const file of [
    'src/components/settings/PrivacySettingsForm.tsx',
    'src/components/settings/NotificationSettingsForm.tsx',
    'src/components/settings/AdminGeneralSettings.tsx',
    'src/components/onboarding/OnboardingFlow.tsx',
    'src/components/groups/CreateGroupForm.tsx',
    'src/components/groups/GroupSettingsForm.tsx',
    'src/components/pages/PageSettingsForm.tsx',
  ]) {
    const source = await read(file)
    assert.ok(source.includes("@/components/ui/Switch"), `${file} bypasses the shared switch`)
    assert.ok(!source.includes('translate-x-5'), `${file} retains fragile toggle geometry`)
    assert.ok(!source.includes("translateX(18px)"), `${file} retains an ad-hoc toggle`)
  }
})

test('release workflow validates before publishing', async () => {
  const workflow = await read('../.github/workflows/desktop-release.yml')
  const typecheck = workflow.indexOf('npm run typecheck')
  const smoke = workflow.indexOf('npm run test:production')
  const publish = workflow.indexOf('npm run desktop:publish-update')
  assert.ok(typecheck >= 0 && smoke > typecheck && publish > smoke)
  assert.ok(workflow.includes("github.ref == 'refs/heads/main'"))
})
