import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = file => readFile(path.join(root, file), 'utf8')
const sourceFiles = async directory => {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => {
    const relative = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(relative) : [relative]
  }))
  return nested.flat().filter(file => /\.(?:tsx|jsx)$/.test(file))
}

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

test('legacy score links resolve into the unified score center', async () => {
  const dugout = await read('src/components/dugout/DugoutClient.tsx')
  const legacyScores = await read('src/app/scores/page.tsx')
  assert.ok(dugout.includes('href="/sports"'))
  assert.ok(!dugout.includes('href="/scores"'))
  assert.ok(legacyScores.includes("redirect(date ? `/sports?date=${encodeURIComponent(date)}` : '/sports')"))
})

test('shared member avatars cannot expand top-bar or social layouts', async () => {
  const avatar = await read('src/components/social/MemberAvatar.tsx')
  const topbar = await read('src/components/layout/TopBar.tsx')
  const css = await read('src/app/globals.css')
  assert.ok(avatar.includes('maxWidth: size'))
  assert.ok(avatar.includes('maxHeight: size'))
  assert.ok(avatar.includes('width={size} height={size}'))
  assert.ok(topbar.includes('className="ss-topbar-profile-avatar"'))
  assert.ok(css.includes('.ss-topbar-profile-trigger > .ss-topbar-profile-avatar'))
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

test('activity and account menus preserve explicit unread state and complete navigation', async () => {
  const topbar = await read('src/components/layout/TopBar.tsx')
  const activityPage = await read('src/app/notifications/page.tsx')
  const activityList = await read('src/components/social/NotificationsList.tsx')
  const css = await read('src/app/globals.css')

  for (const contract of ['NotificationFilter', 'markAllNotificationsRead', 'TopbarNotificationEntry', 'ss-topbar-notification-tabs']) {
    assert.ok(topbar.includes(contract), `top bar activity center is missing ${contract}`)
  }
  for (const destination of ['/bookmarks', '/settings/membership', '/settings/notifications']) {
    assert.ok(topbar.includes(destination), `account shell omits ${destination}`)
  }
  assert.ok(!activityPage.includes(".update({ read: true })"), 'opening the activity page must not silently mark every item read')
  assert.ok(activityList.includes('markAllRead'))
  assert.ok(activityList.includes('ss-activity-toolbar'))
  assert.ok(css.includes(".ss-topbar-notification-row[data-unread='true']"))
  assert.ok(css.includes('.ss-activity-toolbar'))
})

test('private account fields are not exposed through public profile reads', async () => {
  const columns = await read('src/lib/supabase/userColumns.ts')
  const auth = await read('src/context/AuthContext.tsx')
  const accountRoute = await read('src/app/api/account/me/route.ts')
  for (const privateField of ['email', 'whop_connected_company_id', 'whop_membership_id', 'notification_settings', 'notification_delivery_settings', 'interest_settings']) {
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
  const reconcileGrants = await read('supabase/migrations/20260820194500_lock_reconcile_state_grants.sql')
  assert.ok(fetcher.includes('AbortSignal.timeout(REQUEST_TIMEOUT_MS)'))
  assert.ok(fetcher.includes('for (let page = 2; page <= totalPages; page++)'))
  assert.ok(fetcher.includes('failed after ${MAX_ATTEMPTS} attempts'))
  assert.ok(fetcher.includes('totalPages = Math.max(totalPages, pageBody.totalPages)'))
  assert.ok(fetcher.includes('const deduped = new Map'))
  assert.ok(main.includes('if (unchanged) continue'))
  assert.ok(main.includes('if (accessChanged)'))
  assert.ok(main.includes('stopped before writes'))
  assert.ok(main.includes('fetchWhopMembershipById'))
  assert.ok(main.includes('RECONCILE_BATCH_SIZE = 24'))
  assert.ok(main.includes('REQUEST_SPACING_MS = 1_200'))
  assert.ok(main.includes(".from('integration_reconcile_state')"))
  assert.ok(reconcileGrants.includes('revoke all on table public.integration_reconcile_state from anon, authenticated'))
  assert.ok(reconcileGrants.includes('grant all on table public.integration_reconcile_state to service_role'))
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
    assert.ok(reconcile.includes("select('id, whop_membership_id"))
    assert.ok(reconcile.includes('whopMembershipGrantsAccess'))
    assert.ok(reconcile.includes('shouldRevokeStoredWhopAccess'))
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
  const watchdog = await read('src/app/api/cron/replay-operational-retries/route.ts')
  assert.ok(health.indexOf("status: 'running'") < health.indexOf('await handler(request)'))
  assert.ok(health.includes(".update({"))
  assert.ok(admin.includes("? 'timed_out'"))
  assert.ok(admin.includes("? 'Timed out'"))
  assert.ok(admin.includes("status === 'running' ? 'Running' : 'No duration'"))
  assert.ok(watchdog.includes(".from('pipeline_runs')"))
  assert.ok(watchdog.includes(".eq('status', 'running')"))
  assert.ok(watchdog.includes(".lt('started_at', abandonedBefore)"))
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

test('article likes are member-scoped and atomically counted', async () => {
  const button = await read('src/components/blog/BlogLikeButton.tsx')
  const page = await read('src/app/blog/[slug]/page.tsx')
  const route = await read('src/app/api/blogs/[id]/like/route.ts')
  const migration = await read('supabase/migrations/20260911211000_harden_blog_reactions.sql')
  assert.ok(button.includes("fetch(`/api/blogs/${blogId}/like`"))
  assert.ok(!button.includes("from('blogs').update"))
  assert.ok(page.includes("from('blog_likes').select('blog_id')"))
  assert.ok(route.includes('supabase.auth.getUser()'))
  assert.ok(route.includes("admin.rpc('toggle_blog_like'"))
  assert.ok(migration.includes('blog_likes_user_id_idx'))
  assert.ok(migration.includes('using ((select auth.uid()) = user_id)'))
  assert.ok(migration.includes('revoke all on function public.toggle_blog_like(uuid, uuid) from public, anon, authenticated'))
  assert.ok(migration.includes('grant execute on function public.toggle_blog_like(uuid, uuid) to service_role'))
})

test('forum counters and activity ordering stay synchronized', async () => {
  const migration = await read('supabase/migrations/20260911220000_forum_count_sync.sql')
  assert.ok(migration.includes('after insert or update or delete on public.forum_replies'))
  assert.ok(migration.includes('after insert or update of category_id or delete on public.forum_threads'))
  assert.ok(migration.includes('set reply_count ='))
  assert.ok(migration.includes('set thread_count ='))
  assert.ok(migration.includes('last_reply_at = coalesce'))
  assert.ok(migration.includes('revoke all on function public.sync_forum_thread_metrics() from public, anon, authenticated'))
})

test('discussion replies and reactions feed the shared activity center', async () => {
  const replyForm = await read('src/components/forum/ThreadReplyForm.tsx')
  const reactions = await read('src/components/forum/ForumReactions.tsx')
  const notify = await read('src/lib/notify.ts')
  assert.ok(replyForm.includes("'replied to your comment' : 'replied to your discussion'"))
  assert.ok(replyForm.includes("notifyMentions(supabase"))
  assert.ok(reactions.includes('reacted ${emoji} to your discussion'))
  assert.ok(reactions.includes("data: { emoji }"))
  assert.ok(notify.includes('data: data ?? {}'))
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
  assert.ok(middleware.includes("alreadyRetried ? 'SESSION_EXPIRED' : 'SESSION_REFRESH_RETRY'"))
  assert.ok(middleware.includes("'SESSION_REFRESH_RETRY'"))
  assert.ok(middleware.includes('if (alreadyRetried)'))
  assert.ok(middleware.includes("loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)"))
  assert.ok(middleware.includes('AUTH_REFRESH_RETRY_COOKIE'))
  assert.ok(middleware.includes('clearStaleSupabaseAuthCookies'))
  assert.ok(!middleware.includes('return supabaseResponse // Allow request to proceed'))
})

test('account reads distinguish auth, missing profiles, and database failures', async () => {
  const route = await read('src/app/api/account/me/route.ts')
  assert.ok(route.includes('supabase.auth.getClaims()'))
  assert.ok(route.includes('.maybeSingle()'))
  assert.ok(route.includes("code: 'PROFILE_NOT_FOUND'"))
  assert.ok(route.includes("safeApiError('account-me'"))
})

test('heavy analytics jobs use bounded, contention-safe cron stages', async () => {
  const vercel = JSON.parse(await read('vercel.json'))
  const marketDna = await read('src/app/api/cron/market-dna-maintenance/route.ts')
  const statcast = await read('src/app/api/cron/statcast-integrity-check/route.ts')
  assert.ok(marketDna.includes('const MAX_BACKFILL_DATES = 2'))
  assert.ok(marketDna.includes("searchParams.get('fitOnly') === '1'"))
  assert.ok(marketDna.includes("stage: 'archive'"))
  assert.ok(marketDna.includes("stage: 'model-fit'"))
  assert.ok(vercel.crons.some(cron => cron.path === '/api/cron/market-dna-maintenance?fitOnly=1'))
  assert.equal(vercel.crons.find(cron => cron.path === '/api/cron/statcast-integrity-check')?.schedule, '50 10-16 * * *')
  assert.ok(statcast.includes('const retryDelaysMs = [1_500, 5_000]'))
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

test('contact recap exports are durable without a vulnerable workflow runtime', async () => {
  const packageJson = await read('package.json')
  const queue = await read('src/lib/contactRecapExportQueue.ts')
  const createRoute = await read('src/app/api/admin/contact-recap-jobs/route.ts')
  const replayRoute = await read('src/app/api/admin/contact-recap-jobs/[id]/route.ts')
  const cronRoute = await read('src/app/api/cron/process-contact-recap-exports/route.ts')
  const vercel = await read('vercel.json')
  assert.ok(!packageJson.includes('"@workflow/'))
  assert.ok(!packageJson.includes('"workflow"'))
  assert.ok(queue.includes(".in('status', ['queued', 'retrying'])"))
  assert.ok(queue.includes('attempt >= MAX_ATTEMPTS'))
  assert.ok(queue.includes('Recovered after an interrupted render'))
  assert.ok(createRoute.includes('after(async () =>'))
  assert.ok(replayRoute.includes('after(async () =>'))
  assert.ok(cronRoute.includes("withPipelineHealth('process-contact-recap-exports'"))
  assert.ok(vercel.includes('/api/cron/process-contact-recap-exports'))
})

test('release workflow validates before publishing', async () => {
  const workflow = await read('../.github/workflows/desktop-release.yml')
  const typecheck = workflow.indexOf('npm run typecheck')
  const smoke = workflow.indexOf('npm run test:production')
  const publish = workflow.indexOf('npm run desktop:publish-update')
  assert.ok(typecheck >= 0 && smoke > typecheck && publish > smoke)
  assert.ok(workflow.includes("github.ref == 'refs/heads/main'"))
})

test('member avatars use the shared bounded renderer across social surfaces', async () => {
  const files = [
    'src/components/chat/NewDMForm.tsx',
    'src/components/desktop/DesktopNavigation.tsx',
    'src/components/groups/GroupInviteModal.tsx',
    'src/components/social/FeedComposer.tsx',
    'src/components/social/MentionInput.tsx',
    'src/components/social/MentionProfileCard.tsx',
    'src/components/social/PostCardClient.tsx',
    'src/components/social/StoriesBar.tsx',
    'src/components/social/StoriesViewer.tsx',
    'src/app/leaderboard/LeaderboardClient.tsx',
    'src/components/marketplace/MatrixMarketplaceClient.tsx',
    'src/components/marketplace/MatrixMarketplaceDetailClient.tsx',
    'src/app/creators/offers/[productId]/page.tsx',
  ]

  const avatar = await read('src/components/social/MemberAvatar.tsx')
  assert.ok(avatar.includes('maxWidth: size'))
  assert.ok(avatar.includes('maxHeight: size'))
  assert.ok(avatar.includes('flexShrink: 0'))

  for (const file of files) {
    const source = await read(file)
    assert.ok(source.includes('MemberAvatar'), `${file} bypasses the bounded member avatar`)
  }
})

test('health checks remain machine-readable when dependencies are unavailable', async () => {
  const health = await read('src/app/api/health/route.ts')
  assert.ok(health.includes('try {'))
  assert.ok(health.includes('} catch {'))
  assert.ok(health.includes("status: healthy ? 200 : 503"))
  assert.ok(health.includes("database: healthy ? 'reachable' : 'unavailable'"))
})

test('community destinations share navigation and route transition states', async () => {
  const navigation = await read('src/components/community/CommunityNav.tsx')
  for (const destination of ['/feed', '/channels', '/messages', '/groups', '/forum', '/pages', '/events', '/blog', '/notifications', '/bookmarks']) {
    assert.ok(navigation.includes(`href: '${destination}'`), `community navigation omits ${destination}`)
  }

  for (const route of ['channels', 'messages', 'groups', 'forum', 'notifications', 'bookmarks', 'profile', 'search', 'events', 'pages', 'blog', 'creators']) {
    const loading = await read(`src/app/${route}/loading.tsx`)
    assert.ok(loading.includes('DataRouteLoading'), `${route} lacks a shared transition state`)
  }
})

test('creator and story publishing avoid full-page reload handoffs', async () => {
  const studio = await read('src/app/creators/studio/CreatorStudioClient.tsx')
  const story = await read('src/components/social/CreateStoryForm.tsx')
  assert.ok(studio.includes('router.refresh()'))
  assert.ok(!studio.includes('window.location.reload()'))
  assert.ok(story.includes("router.push('/feed')"))
  assert.ok(!story.includes("router.push('/feed')\n    router.refresh()"))
})

test('creator studio validates offers and keeps provider failures private', async () => {
  const studio = await read('src/app/creators/studio/CreatorStudioClient.tsx')
  assert.ok(studio.includes('Number.isFinite(price)'))
  assert.ok(studio.includes("setNotice('Storefront link copied.')"))
  assert.ok(studio.includes('aria-live="polite"'))
  assert.ok(!studio.includes('data?.error'))
})

test('creator checkout and payouts expose retryable product states without provider errors', async () => {
  const checkout = await read('src/app/creators/offers/[productId]/CheckoutButton.tsx')
  const payouts = await read('src/app/creators/payouts/PayoutSetupClient.tsx')
  const apply = await read('src/app/creators/apply/page.tsx')
  assert.ok(checkout.includes('Checkout could not be opened. Please try again.'))
  assert.ok(!checkout.includes('payload?.error'))
  assert.ok(payouts.includes('loadPayoutTools'))
  assert.ok(payouts.includes('Secure payout tools could not load. Please try again.'))
  assert.ok(!payouts.includes('payload.error'))
  assert.ok(!apply.includes(': submitError.message'))
})

test('membership commerce and NFL identity retain safe public fallbacks', async () => {
  const pricing = await read('src/app/pricing/PricingCheckoutButton.tsx')
  const cancel = await read('src/app/settings/membership/CancelMembershipButton.tsx')
  const logo = await read('src/components/shared/NflTeamLogo.tsx')
  assert.ok(pricing.includes('Checkout could not be opened. Please try again.'))
  assert.ok(!pricing.includes('data?.error'))
  assert.ok(cancel.includes('Your subscription could not be canceled. Please try again.'))
  assert.ok(!cancel.includes('data?.error'))
  assert.ok(logo.includes('<SafeImage'))
})

test('public trust pages share one accessible information landmark', async () => {
  const shell = await read('src/components/marketing/InfoPageShell.tsx')
  assert.ok(shell.includes('className={styles.main}'))
  assert.ok(shell.includes('aria-label="Table of contents"'))
})

test('core research routes provide branded transition and recovery states', async () => {
  const routes = ['batter-cost', 'slate-breakdown', 'pitcher-report', 'weather-lab', 'spray-charts', 'synergy', 'the-public', 'daily-recap']
  for (const route of routes) {
    assert.ok((await read(`src/app/${route}/loading.tsx`)).includes('DataRouteLoading'), `${route} lacks route loading`)
    assert.ok((await read(`src/app/${route}/error.tsx`)).includes('DataRouteError'), `${route} lacks route recovery`)
  }
  const recap = await read('src/app/daily-recap/page.tsx')
  const sideline = await read('src/app/the-sideline/page.tsx')
  assert.ok(recap.includes('<ProductPageShell>'))
  assert.ok(!recap.includes('fallback={null}'))
  assert.ok(sideline.includes('title="No games on this date"'))
})

test('score, research, and event workspaces avoid blank route states', async () => {
  const allStar = await read('src/app/allstar2026/page.tsx')
  assert.ok(!allStar.includes('fallback={null}'))
  for (const route of ['research', 'allstar2026']) {
    assert.ok((await read(`src/app/${route}/loading.tsx`)).includes('DataRouteLoading'))
    assert.ok((await read(`src/app/${route}/error.tsx`)).includes('DataRouteError'))
  }
  assert.ok((await read('src/app/sports/page.tsx')).includes('ss-scores-empty'))
  assert.ok((await read('src/app/sports/error.tsx')).includes('DataRouteError'))
})

test('forum discovery retains an actionable empty state for members and visitors', async () => {
  const forum = await read('src/app/forum/page.tsx')
  assert.ok(forum.includes("user ? 'Create a thread' : 'Sign in to participate'"))
  assert.ok(forum.includes("user ? '/forum/new' : '/auth/login?next=/forum/new'"))
})

test('NFL Matrices distinguish loading failures from truthful empty states', async () => {
  const matrix = await read('src/components/sideline/NflMatrixButton.tsx')
  assert.ok(matrix.includes('loadingMatrices'))
  assert.ok(matrix.includes('loadingCommunity'))
  assert.ok(matrix.includes("setMessage('NFL Matrices could not load. Try again.')"))
  assert.ok(matrix.includes("setMessage('Element code copied.')"))
  assert.ok(matrix.includes('aria-live="polite"'))
})

test('browser verification enforces shared accessibility fundamentals', async () => {
  const smoke = await read('scripts/browser-smoke.mjs')
  assert.ok(smoke.includes('expected one main landmark'))
  assert.ok(smoke.includes('visible actions lack an accessible name'))
  assert.ok(smoke.includes('visible fields lack an accessible label'))
  assert.ok(smoke.includes('images lack alt attributes'))
  assert.ok(smoke.includes("visible(image) && !image.hasAttribute('alt')"))
})

test('shared loading, feedback, and registration states expose valid semantics', async () => {
  const loading = await read('src/components/layout/DataRouteState.tsx')
  const feedback = await read('src/components/ui/FeedbackProvider.tsx')
  const register = await read('src/app/auth/register/page.tsx')
  assert.ok(loading.includes('role="status" aria-live="polite" aria-busy="true"'))
  assert.ok(loading.includes('<h1 className="sr-only">Loading {label}</h1>'))
  assert.ok(feedback.includes('role="region" aria-live="polite" aria-label="Notifications"'))
  assert.ok(register.includes('role="progressbar"'))
  assert.ok(register.includes('aria-valuenow={step === \'account\' ? 1 : 2}'))
})

test('account recovery associates its visible label with the email field', async () => {
  const recovery = await read('src/app/auth/forgot-password/page.tsx')
  assert.ok(recovery.includes('htmlFor="recovery-email"'))
  assert.ok(recovery.includes('id="recovery-email"'))
})

test('mobile navigation keeps the community workspace active across every social route', async () => {
  const dock = await read('src/components/layout/MobileDock.tsx')
  for (const route of ['/channels', '/messages', '/groups', '/forum', '/pages', '/events', '/blog', '/notifications', '/bookmarks']) {
    assert.ok(dock.includes(`'${route}'`), `mobile community state omits ${route}`)
  }
  assert.ok(dock.includes('item.sections?.some'))
})

test('desktop navigation classifies every social route as community', async () => {
  const navigation = await read('src/components/desktop/DesktopNavigation.tsx')
  for (const route of ['/channels', '/messages', '/groups', '/forum', '/pages', '/events', '/blog', '/notifications', '/bookmarks']) {
    assert.ok(navigation.includes(`'${route}'`), `desktop community navigation omits ${route}`)
  }
  assert.ok(navigation.includes('communitySections.some'))
})

test('live chat supports rich mentions without dropping send failures', async () => {
  const room = await read('src/components/chat/ChatRoom.tsx')
  const direct = await read('src/components/chat/DMRoom.tsx')
  assert.ok(room.includes('<MentionInput'))
  assert.ok(room.includes('await notifyMentions'))
  assert.ok(room.includes('<LinkifiedText'))
  assert.ok(room.includes("setSendError('Message not sent. Try again.')"))
  assert.ok(direct.includes('<LinkifiedText'))
})

test('community events preserve online intent and validate join links', async () => {
  const form = await read('src/components/events/CreateEventForm.tsx')
  assert.ok(form.includes('checked={form.is_online}'))
  assert.ok(form.includes('form.is_online ? form.link.trim() : null'))
  assert.ok(form.includes("['http:', 'https:'].includes(url.protocol)"))
  assert.ok(form.includes("new Date(form.end_date) <= new Date(form.start_date)"))
  assert.ok(form.includes('<form className="ss-flow-form" onSubmit={create}>'))
})

test('community group creation is atomic and creator-scoped', async () => {
  const form = await read('src/components/groups/CreateGroupForm.tsx')
  const migration = await read('supabase/migrations/20260911230000_atomic_community_group_creation.sql')
  const invoker = await read('supabase/migrations/20260911231000_use_invoker_for_community_group_creation.sql')
  assert.ok(form.includes("supabase.rpc('create_community_group'"))
  assert.ok(!form.includes("from('group_members').insert"))
  assert.ok(migration.includes('v_user_id uuid := auth.uid()'))
  assert.ok(migration.includes("u.account_type in ('creator', 'admin')"))
  assert.ok(migration.includes('cp.creator_id = v_user_id'))
  assert.ok(migration.includes('insert into public.group_members'))
  assert.ok(migration.includes('insert into public.channel_members'))
  assert.ok(migration.includes('grant execute on function public.create_community_group'))
  assert.ok(invoker.includes('security invoker'))
})

test('native community creation forms retain product context without leaking backend errors', async () => {
  const page = await read('src/components/pages/CreatePageForm.tsx')
  const event = await read('src/components/events/CreateEventForm.tsx')
  const group = await read('src/components/groups/CreateGroupForm.tsx')
  assert.ok(page.includes("const SPORTS = ['MLB', 'NFL'"))
  assert.ok(page.includes('sportLogoUrl(sport)'))
  assert.ok(page.includes('<form className="ss-flow-form" onSubmit={create}>'))
  assert.ok(!page.includes('setError(err.message)'))
  assert.ok(!event.includes('setError(err.message)'))
  assert.ok(!group.includes('setError(err.message)'))
})

test('discussion authoring and rendering support rich mentions end to end', async () => {
  const thread = await read('src/components/forum/NewThreadForm.tsx')
  const reply = await read('src/components/forum/ThreadReplyForm.tsx')
  const detail = await read('src/app/forum/thread/[id]/page.tsx')
  assert.ok(thread.includes('<MentionInput'))
  assert.ok(thread.includes('await notifyMentions'))
  assert.ok(thread.includes('<form className="ss-flow-form" onSubmit={submit}>'))
  assert.ok(reply.includes('<MentionInput'))
  assert.ok(reply.includes('onSubmit={reply}'))
  assert.ok(detail.includes('<LinkifiedText'))
})

test('page settings preserve sport identity and reject unsafe media links', async () => {
  const settings = await read('src/components/pages/PageSettingsForm.tsx')
  assert.ok(settings.includes('sport: page.sport'))
  assert.ok(settings.includes('sport: form.sport || null'))
  assert.ok(settings.includes('isSafeImageUrl(form.avatar_url)'))
  assert.ok(settings.includes("['http:', 'https:'].includes"))
  assert.ok(!settings.includes('setError(err.message)'))
})

test('group settings synchronize workspace identity atomically', async () => {
  const settings = await read('src/components/groups/GroupSettingsForm.tsx')
  const migration = await read('supabase/migrations/20260911232000_atomic_community_group_settings.sql')
  assert.ok(settings.includes("supabase.rpc('update_community_group'"))
  assert.ok(!settings.includes("from('channels').update"))
  assert.ok(settings.includes('isSafeImageUrl(form.avatar_url)'))
  assert.ok(!settings.includes('setError(err.message)'))
  assert.ok(migration.includes('security invoker'))
  assert.ok(migration.includes('g.owner_id = v_user_id'))
  assert.ok(migration.includes('update public.groups'))
  assert.ok(migration.includes('update public.channels'))
  assert.ok(migration.includes('grant execute on function public.update_community_group'))
})

test('group membership and invite acceptance update group and chat access atomically', async () => {
  const join = await read('src/components/groups/GroupJoinButton.tsx')
  const invite = await read('src/components/groups/GroupInviteResponse.tsx')
  const migration = await read('supabase/migrations/20260911234000_atomic_group_membership.sql')
  assert.ok(join.includes("supabase.rpc('set_group_membership'"))
  assert.ok(!join.includes("from('channel_members')"))
  assert.ok(invite.includes("supabase.rpc('respond_to_group_invite'"))
  assert.ok(!invite.includes("from('group_members')"))
  assert.ok(migration.includes('security invoker'))
  assert.ok(migration.includes("role <> 'owner'"))
  assert.ok(migration.includes('insert into public.channel_members'))
  assert.ok(migration.includes('for update'))
  assert.ok(migration.includes('grant execute on function public.set_group_membership'))
  assert.ok(migration.includes('grant execute on function public.respond_to_group_invite'))
})

test('blocking an account removes both relationship directions atomically', async () => {
  const blocks = await read('src/lib/blocks.ts')
  const migration = await read('supabase/migrations/20260911233000_atomic_account_blocking.sql')
  const follow = await read('src/components/social/FollowButton.tsx')
  assert.ok(blocks.includes("supabase.rpc('set_account_block'"))
  assert.ok(!blocks.includes("from('follows').delete"))
  assert.ok(migration.includes('security invoker'))
  assert.ok(migration.includes("private.check_rate_limit('block:'"))
  assert.ok(migration.includes('follower_id = p_target_id and following_id = v_user_id'))
  assert.ok(migration.includes('revoke all on function public.set_account_block'))
  assert.ok(follow.includes('setFailed(true)'))
  assert.ok(follow.includes('role="alert"'))
})

test('profile and account editors validate identity fields without exposing provider errors', async () => {
  const profile = await read('src/components/settings/ProfileForm.tsx')
  const account = await read('src/components/settings/AccountSettingsForm.tsx')
  assert.ok(profile.includes('<form className="space-y-6" onSubmit={save}>'))
  assert.ok(profile.includes('isSafeHttpUrl(form.website)'))
  assert.ok(profile.includes('/^[a-z0-9._]+$/'))
  assert.ok(profile.includes('maxLength={280}'))
  assert.ok(profile.includes('<SafeImage src={form.avatar_url}'))
  assert.ok(!profile.includes('setError(err.message)'))
  assert.ok(!profile.includes('setConnectedError(err.message'))
  assert.ok(account.includes("useState<'email' | 'password' | null>"))
  assert.ok(account.includes('finally {'))
  assert.ok(account.includes('autoComplete="new-password"'))
  assert.ok(!account.includes('setError(err.message)'))
})

test('settings hub exposes every account workflow with an accessible shared shell', async () => {
  const page = await read('src/app/settings/page.tsx')
  const shell = await read('src/components/settings/SettingsShell.tsx')
  const audit = await read('src/lib/productExperienceAudit.ts')
  for (const href of ['/settings/profile', '/settings/interests', '/settings/account', '/settings/security', '/settings/notifications', '/settings/privacy', '/settings/blocked', '/settings/membership', '/creators/apply', '/faq', '/support']) {
    assert.ok(page.includes(`href: '${href}'`), `settings hub omits ${href}`)
  }
  assert.ok(shell.includes('aria-label="Settings sections"'))
  assert.ok(shell.includes("aria-current={current ? 'page' : undefined}"))
  assert.ok(shell.includes('aria-labelledby="settings-page-title"'))
  assert.ok(page.includes('aria-labelledby={`settings-${section.title.toLowerCase()}-heading`}'))
  assert.ok(audit.includes("'/settings': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' }"))
})

test('member interests persist across onboarding and remain privately editable', async () => {
  const onboardingPage = await read('src/app/onboarding/page.tsx')
  const onboarding = await read('src/components/onboarding/OnboardingFlow.tsx')
  const interestsPage = await read('src/app/settings/interests/page.tsx')
  const interests = await read('src/components/settings/InterestSettingsForm.tsx')
  const migration = await read('supabase/migrations/20260912163558_member_interest_settings.sql')
  const columns = await read('src/lib/supabase/userColumns.ts')
  assert.ok(onboardingPage.includes('interest_settings'))
  assert.ok(onboarding.includes('contentMix'))
  assert.ok(onboarding.includes('marketFocus'))
  assert.ok(onboarding.includes('interest_settings: {'))
  assert.ok(interestsPage.includes("redirect('/auth/login?next=/settings/interests')"))
  assert.ok(interests.includes(".from('users').update"))
  assert.ok(interests.includes("discovery_mode"))
  assert.ok(migration.includes("jsonb_typeof(interest_settings) = 'object'"))
  assert.ok(columns.split('export const PRIVATE_ACCOUNT_COLUMNS')[0].includes('interest_settings') === false)
  assert.ok(columns.split('export const PRIVATE_ACCOUNT_COLUMNS')[1].includes("'interest_settings'"))
})

test('canonical game pages include secure realtime Game Rooms', async () => {
  const page = await read('src/app/sports/[sport]/[gameId]/page.tsx')
  const room = await read('src/components/community/GameRoom.tsx')
  const general = await read('src/app/sports/[sport]/[gameId]/GameDetailClient.tsx')
  const mlb = await read('src/app/sports/[sport]/[gameId]/MLBGameClient.tsx')
  const migration = await read('supabase/migrations/20260912164609_canonical_game_rooms.sql')
  assert.ok(page.includes(".from('game_room_messages')"))
  assert.ok(page.includes(".eq('sport', sport).eq('game_id', gameId)"))
  assert.ok(room.includes(".channel(`game-room:${sport}:${gameId}`)"))
  assert.ok(room.includes("filter: `game_id=eq.${gameId}`"))
  assert.ok(room.includes("if (next.sport !== sport) return"))
  assert.ok(room.includes(".from('game_room_messages').insert"))
  assert.ok(room.includes('role="alert"'))
  assert.ok(general.includes("{ id: 'room', label: 'Game Room'"))
  assert.ok(mlb.includes("'Game Room'"))
  assert.ok(migration.includes('alter table public.game_room_messages enable row level security'))
  assert.ok(migration.includes("private.check_rate_limit('game-room:'"))
  assert.ok(migration.includes('user_id = (select auth.uid())'))
  assert.ok(migration.includes('alter publication supabase_realtime add table public.game_room_messages'))
})

test('global discovery supports durable member-scoped saved searches', async () => {
  const search = await read('src/components/search/SearchClient.tsx')
  const migration = await read('supabase/migrations/20260912165058_saved_searches.sql')
  assert.ok(search.includes(".from('saved_searches').select"))
  assert.ok(search.includes(".from('saved_searches').upsert"))
  assert.ok(search.includes("onConflict: 'user_id,query_key,result_tab'"))
  assert.ok(search.includes(".from('saved_searches').delete"))
  assert.ok(search.includes('setQ(saved.query); setTab(saved.result_tab)'))
  assert.ok(search.includes('aria-labelledby="saved-searches-heading"'))
  assert.ok(search.includes('role="alert"'))
  assert.ok(migration.includes('alter table public.saved_searches enable row level security'))
  assert.ok(migration.includes('user_id = (select auth.uid())'))
  assert.ok(migration.includes('unique (user_id, query_key, result_tab)'))
  assert.ok(!migration.includes('grant select on public.saved_searches to anon'))
})

test('quiet hours gate real push and email delivery while preserving game priority', async () => {
  const settingsPage = await read('src/app/settings/notifications/page.tsx')
  const form = await read('src/components/settings/NotificationSettingsForm.tsx')
  const delivery = await read('src/lib/notificationDelivery.ts')
  const push = await read('src/app/api/push/send/route.ts')
  const email = await read('src/app/api/email/send-notification/route.ts')
  const columns = await read('src/lib/supabase/userColumns.ts')
  const exportRoute = await read('src/app/api/account/data-export/[requestId]/download/route.ts')
  const migration = await read('supabase/migrations/20260912165431_notification_delivery_controls.sql')
  assert.ok(settingsPage.includes('notification_delivery_settings'))
  assert.ok(form.includes('quiet_hours_enabled'))
  assert.ok(form.includes('live_game_priority'))
  assert.ok(form.includes('type="time"'))
  assert.ok(delivery.includes('shouldSuppressNotificationDelivery'))
  assert.ok(delivery.includes("type === 'lineup_confirmed'"))
  assert.ok(push.includes('shouldSuppressNotificationDelivery'))
  assert.ok(email.includes('shouldSuppressNotificationDelivery'))
  assert.ok(email.includes("error: 'quiet hours'"))
  assert.ok(columns.split('export const PRIVATE_ACCOUNT_COLUMNS')[0].includes('notification_delivery_settings') === false)
  assert.ok(exportRoute.includes('notification_delivery_settings,interest_settings'))
  assert.ok(migration.includes("jsonb_typeof(notification_delivery_settings) = 'object'"))
})

test('private research workspaces compose watchlists, matrices, comparisons, and notes', async () => {
  const page = await read('src/app/workspace/page.tsx')
  const workspace = await read('src/components/research/ResearchWorkspaceClient.tsx')
  const command = await read('src/components/layout/GlobalCommandPalette.tsx')
  const desktop = await read('src/components/desktop/DesktopNavigation.tsx')
  const sidebar = await read('src/components/layout/Sidebar.tsx')
  const migration = await read('supabase/migrations/20260912165944_research_workspaces.sql')
  assert.ok(page.includes("redirect('/auth/login?next=/workspace')"))
  assert.ok(page.includes(".from('watchlist_items')"))
  assert.ok(page.includes(".from('matrices')"))
  assert.ok(page.includes(".from('nfl_matrices')"))
  assert.ok(workspace.includes('current.length < 4'))
  assert.ok(workspace.includes(".from('research_workspaces').insert"))
  assert.ok(workspace.includes(".from('research_notes').insert"))
  assert.ok(workspace.includes('aria-pressed={selected}'))
  assert.ok(command.includes("href: '/workspace'"))
  assert.ok(desktop.includes("href: '/workspace'"))
  assert.ok(sidebar.includes("href: '/workspace'"))
  assert.ok(migration.includes('alter table public.research_workspaces enable row level security'))
  assert.ok(migration.includes('alter table public.research_notes enable row level security'))
  assert.ok(migration.includes('user_id = (select auth.uid())'))
  assert.ok(!migration.includes('grant select on public.research_workspaces to anon'))
  assert.ok(!migration.includes('grant select on public.research_notes to anon'))
})

test('group conversations are private, bounded, realtime, and integrated with the message inbox', async () => {
  const migration = await read('supabase/migrations/20260912171311_group_direct_messages.sql')
  const picker = await read('src/components/chat/NewDMForm.tsx')
  const room = await read('src/components/chat/GroupDMRoom.tsx')
  const page = await read('src/app/messages/group/[id]/page.tsx')
  const inbox = await read('src/app/messages/page.tsx')
  assert.ok(migration.includes('alter table public.group_conversations enable row level security'))
  assert.ok(migration.includes('alter table public.group_conversation_members enable row level security'))
  assert.ok(migration.includes('alter table public.group_messages enable row level security'))
  assert.ok(migration.includes('private.is_group_conversation_member'))
  assert.ok(migration.includes('cardinality(clean_ids) < 2 or cardinality(clean_ids) > 19'))
  assert.ok(migration.includes("private.check_rate_limit('group-create:'"))
  assert.ok(migration.includes("private.check_rate_limit('group-message:'"))
  assert.ok(migration.includes('alter publication supabase_realtime add table public.group_messages'))
  assert.ok(!migration.includes('grant select on public.group_messages to anon'))
  assert.ok(picker.includes("mode, setMode] = useState<'direct' | 'group'>"))
  assert.ok(picker.includes("supabase.rpc('create_group_conversation'"))
  assert.ok(picker.includes('current.length < 19'))
  assert.ok(page.includes("redirect('/auth/login?next=/messages')"))
  assert.match(room, /\.channel\(`group-dm:\$\{conversation\.id\}`\)/)
  assert.match(room, /\.from\(["']group_messages["']\)\s*\.insert/)
  assert.match(room, /uploadMedia\(file, ["']messages["']\)/)
  assert.ok(inbox.includes(".from('group_conversation_members')"))
  assert.ok(inbox.includes('<GroupConversationInbox'))
})

test('creator drafts and scheduled posts publish through a bounded observable job', async () => {
  const migration = await read('supabase/migrations/20260912172139_creator_scheduled_posts.sql')
  const api = await read('src/app/api/creator/scheduled-posts/route.ts')
  const cron = await read('src/app/api/cron/publish-scheduled-posts/route.ts')
  const studio = await read('src/app/creators/studio/ScheduledPostPlanner.tsx')
  const studioPage = await read('src/app/creators/studio/page.tsx')
  const vercel = await read('vercel.json')
  assert.ok(migration.includes('alter table public.creator_scheduled_posts enable row level security'))
  assert.ok(migration.includes("status in ('draft', 'scheduled', 'failed')"))
  assert.ok(!migration.includes('grant select on public.creator_scheduled_posts to anon'))
  assert.ok(api.includes('hasApprovedCreatorAccess'))
  assert.ok(api.includes("consumeServerRateLimit(gate.user.id, 'creator_schedule_post'"))
  assert.ok(cron.includes("withPipelineHealth('publish-scheduled-posts'"))
  assert.ok(cron.includes(".eq('id', item.id).eq('status', 'scheduled')"))
  assert.ok(cron.includes(".limit(50)"))
  assert.ok(cron.includes("status: 'published', published_post_id: post.id"))
  assert.ok(studio.includes('type="datetime-local"'))
  assert.ok(studio.includes("action: 'edit'"))
  assert.ok(studio.includes("method: 'DELETE'"))
  assert.ok(studio.includes('calendarDays.map'))
  assert.ok(api.includes("creator_update_scheduled_post"))
  assert.ok(api.includes("creator_delete_scheduled_post"))
  assert.ok(api.includes("action?: 'cancel' | 'schedule' | 'edit'"))
  assert.ok(studioPage.includes(".from('creator_scheduled_posts')"))
  assert.ok(vercel.includes('/api/cron/publish-scheduled-posts'))
})

test('product experience audit tracks every completed route dimension', async () => {
  const audit = await read('src/lib/productExperienceAudit.ts')
  assert.ok(audit.includes("accessibility: 'complete'"))
  assert.ok(audit.includes("'/admin/product-audit'"))
  assert.ok(!audit.includes("accessibility: 'missing'"))
  assert.ok(!audit.includes("accessibility: 'partial'"))
})

test('settings editors expose programmatic field names and announced failures', async () => {
  const profile = await read('src/components/settings/ProfileForm.tsx')
  const account = await read('src/components/settings/AccountSettingsForm.tsx')
  const deletion = await read('src/components/settings/AccountDeletionControl.tsx')
  const notifications = await read('src/components/settings/NotificationSettingsForm.tsx')
  for (const label of ['Display name', 'Username', 'Bio', 'Location', 'Website', 'Search favorite MLB players']) {
    assert.ok(profile.includes(`aria-label="${label}"`), `profile editor omits ${label} field name`)
  }
  for (const label of ['Email address', 'New password', 'Confirm new password']) {
    assert.ok(account.includes(`aria-label="${label}"`), `account editor omits ${label} field name`)
  }
  assert.ok(profile.includes('role="alert"'))
  assert.ok(deletion.includes('aria-label="Reason for leaving"'))
  assert.ok(deletion.includes('role="alert"'))
  assert.ok(notifications.includes('<button type="button" onClick={save}'))
})

test('icon-only product controls retain explicit accessible names and button semantics', async () => {
  const files = [
    'src/components/dugout/PostBetModal.tsx',
    'src/components/dugout/PipelineBuilder.tsx',
    'src/components/dugout/CustomMatrixPanel.tsx',
    'src/components/settings/ProfileForm.tsx',
    'src/components/social/ReportModal.tsx',
    'src/app/the-sideline/SidelineBoardClient.tsx',
    'src/components/admin/AdminForumActions.tsx',
    'src/components/admin/AdminPageActions.tsx',
    'src/app/admin/emojis/EmojiUploadForm.tsx',
    'src/app/admin/changelog/ChangelogManager.tsx',
  ]
  const contents = await Promise.all(files.map(read))
  for (const [index, source] of contents.entries()) {
    assert.ok(source.includes('aria-label='), `${files[index]} has no named icon controls`)
  }
  assert.ok(contents[0].includes('role="dialog"'))
  assert.ok(contents[0].includes('aria-modal="true"'))
  assert.ok(contents[4].includes('role="dialog"'))
  assert.ok(contents[4].includes('aria-modal="true"'))
})

test('member creation flows expose named fields and announced errors', async () => {
  const files = [
    'src/components/events/CreateEventForm.tsx',
    'src/components/forum/NewThreadForm.tsx',
    'src/components/groups/CreateGroupForm.tsx',
    'src/components/groups/GroupSettingsForm.tsx',
    'src/components/groups/GroupMemberManager.tsx',
    'src/components/pages/CreatePageForm.tsx',
    'src/components/pages/PageSettingsForm.tsx',
    'src/components/marketplace/CreateListingForm.tsx',
  ]
  const sources = await Promise.all(files.map(read))
  for (const [index, source] of sources.entries()) {
    assert.ok(source.includes('aria-label='), `${files[index]} has no named fields`)
  }
  for (const index of [0, 1, 2, 3, 5, 6, 7]) {
    assert.ok(sources[index].includes('role="alert"'), `${files[index]} does not announce submission failures`)
  }
})

test('NFL Matrix builder names every compact condition control', async () => {
  const matrix = await read('src/components/sideline/NflMatrixButton.tsx')
  for (const label of ['Pipeline step type', 'Condition category', 'Sportsbook market', 'Sportsbook', 'Market value', 'Public pick market', 'Condition field', 'Stat window', 'Rank direction', 'Rank scope', 'Condition join', 'Condition operator', 'Condition value', 'NFL Element Code']) {
    assert.ok(matrix.includes(`aria-label="${label}"`), `NFL Matrix builder omits ${label}`)
  }
  assert.ok(matrix.includes('aria-pressed={matrix.enabled}'))
  assert.ok(matrix.includes('<p role="alert"'))
})

test('feed publishing and interactions recover visibly from failed writes', async () => {
  const composer = await read('src/components/social/FeedComposer.tsx')
  const card = await read('src/components/social/PostCardClient.tsx')
  assert.ok(composer.includes("setError('Failed to post. Try again.')"))
  assert.ok(composer.includes('<SafeImage src={imageUrl}'))
  assert.ok(composer.includes('<p role="alert"'))
  for (const title of ['Reaction not saved', 'Repost not saved', 'Bookmark not saved', 'Comments unavailable', 'Reply not posted', 'Comment not posted', 'Vote not saved']) {
    assert.ok(card.includes(title), `post interactions omit ${title}`)
  }
  assert.ok(card.includes("await navigator.clipboard.writeText(url)"))
  assert.ok(card.includes('<SafeImage'))
})

test('social feed renders as a continuous responsive timeline with familiar actions', async () => {
  const page = await read('src/app/feed/page.tsx')
  const composer = await read('src/components/social/FeedComposer.tsx')
  const list = await read('src/components/social/FeedList.tsx')
  const card = await read('src/components/social/PostCardClient.tsx')
  const detail = await read('src/app/posts/[id]/page.tsx')
  const css = await read('src/app/globals.css')
  assert.ok(page.includes('className="ss-feed-timeline"'))
  assert.ok(page.includes('className="ss-feed-timeline-head"'))
  assert.ok(!page.includes('<CommunityNav'))
  assert.ok(composer.includes('className="ss-composer-sport-menu"'))
  assert.ok(composer.includes('sportMenuRef'))
  assert.ok(composer.includes('visibilityMenuRef'))
  assert.ok(list.includes('className="ss-feed-loading"'))
  assert.ok(card.includes("toggleReaction('❤️')"))
  assert.ok(card.includes('className="ss-post-media"'))
  assert.ok(card.includes('postMenuRef'))
  assert.ok(detail.includes('className="ss-post-detail-shell"'))
  assert.ok(css.includes('Social timeline — one continuous reading surface'))
  assert.ok(css.includes('.ss-feed-post {'))
})

test('social workspaces expose durable message replies, discussion votes, and profile media', async () => {
  const channel = await read('src/components/chat/ChatRoom.tsx')
  const dm = await read('src/components/chat/DMRoom.tsx')
  const queries = await read('src/lib/queries.ts')
  const reactions = await read('src/components/forum/ForumReactions.tsx')
  const profileQuery = await read('src/lib/feedQuery.ts')
  const profilePage = await read('src/app/profile/[username]/page.tsx')
  assert.ok(channel.includes('reply_to_id: replyingTo?.id ?? null'))
  assert.ok(channel.includes('ss-chat-reply-context'))
  assert.ok(channel.includes("uploadMedia(file, 'messages')"))
  assert.ok(channel.includes('media_urls: imageUrl ? [imageUrl] : []'))
  assert.ok(channel.includes('className="ss-chat-media"'))
  assert.ok(dm.includes('reply_to_id: replyingTo?.id ?? null'))
  assert.ok(dm.includes('ss-dm-reply-context'))
  assert.ok(dm.includes("uploadMedia(file, 'messages')"))
  assert.ok(dm.includes('className="ss-dm-media"'))
  assert.ok(queries.includes('messages!messages_reply_to_id_fkey'))
  assert.ok(reactions.includes("const UPVOTE = '⬆️'"))
  assert.ok(reactions.includes('const hadOpposite'))
  assert.ok(profileQuery.includes("'reposts' | 'media'"))
  assert.ok(profilePage.includes("{ key: 'media', label: 'Media' }"))
})

test('community moderators can remove channel messages through an audited server boundary', async () => {
  const chat = await read('src/components/chat/ChatRoom.tsx')
  const group = await read('src/app/groups/[slug]/page.tsx')
  const migration = await read('supabase/migrations/20260912203000_role_aware_channel_moderation.sql')
  assert.ok(chat.includes("supabase.rpc('moderate_channel_message'"))
  assert.ok(chat.includes('canModerate'))
  assert.ok(group.includes("memberRole === 'moderator'"))
  assert.ok(migration.includes("v_role not in ('owner', 'admin', 'moderator')"))
  assert.ok(migration.includes('insert into public.admin_audit_logs'))
  assert.ok(migration.includes('revoke all on function public.moderate_channel_message'))
})

test('social security-definer helpers and read cursors are hardened for production', async () => {
  const migration = await read('supabase/migrations/20260912210000_social_security_and_read_indexes.sql')
  assert.ok(migration.includes('apply_sport_leg_result_to_post(uuid, text, text, text) from public, anon, authenticated'))
  assert.ok(migration.includes('sync_message_reaction_count() from public, anon, authenticated'))
  assert.ok(migration.includes('message_read_positions_pkey primary key (id)'))
  assert.ok(migration.includes('message_read_positions_channel_idx'))
  assert.ok(migration.includes('message_read_positions_partner_idx'))
})

test('direct messages separate and persist unfamiliar conversation requests', async () => {
  const page = await read('src/app/messages/page.tsx')
  const inbox = await read('src/components/social/MessageInbox.tsx')
  const room = await read('src/components/chat/DMRoom.tsx')
  const migration = await read('supabase/migrations/20260912213000_dm_conversation_preferences.sql')
  assert.ok(page.includes("from('dm_conversation_preferences')"))
  assert.ok(page.includes('isRequest:'))
  assert.ok(inbox.includes("section === 'requests'"))
  assert.ok(inbox.includes("setRequestStatus(conversation, 'accepted')"))
  assert.ok(room.includes("status: 'accepted'"))
  assert.ok(migration.includes('primary key (user_id, partner_id)'))
  assert.ok(migration.includes('Members update own DM preferences'))
})

test('feed hide and mute controls persist into subsequent paginated loads', async () => {
  const card = await read('src/components/social/PostCardClient.tsx')
  const feed = await read('src/lib/feedQuery.ts')
  const migration = await read('supabase/migrations/20260912220000_feed_suppressions.sql')
  assert.ok(card.includes("suppressFromFeed('post'"))
  assert.ok(card.includes("suppressFromFeed('author'"))
  assert.ok(feed.includes("from('feed_suppressions')"))
  assert.ok(feed.includes('hiddenPostIds.has(post.id)'))
  assert.ok(feed.includes('mutedAuthorIds.has(post.author_id)'))
  assert.ok(migration.includes("target_type in ('post', 'author')"))
  const safety = await read('src/app/settings/blocked/page.tsx')
  const muted = await read('src/components/settings/MutedUsersList.tsx')
  assert.ok(safety.includes('<MutedUsersList'))
  assert.ok(muted.includes("target_type:'author'"))
})

test('stories provide a polished keyboard, touch, and pauseable viewing flow', async () => {
  const bar = await read('src/components/social/StoriesBar.tsx')
  const viewer = await read('src/components/social/StoriesViewer.tsx')
  const css = await read('src/app/community.css')
  assert.ok(bar.includes('ss-stories-rail'))
  assert.ok(viewer.includes("e.key === ' '"))
  assert.ok(viewer.includes('onTouchStart='))
  assert.ok(viewer.includes("document.body.style.overflow = 'hidden'"))
  assert.ok(viewer.includes("href={`/profile/${story.author.username}`}"))
  assert.ok(css.includes('.ss-story-stage'))
})

test('emoji and GIF media work across the shared social composer layer', async () => {
  const upload = await read('src/app/api/upload/route.ts')
  const emoji = await read('src/components/social/EmojiPicker.tsx')
  const gif = await read('src/components/social/GifPicker.tsx')
  const text = await read('src/components/social/LinkifiedText.tsx')
  const feed = await read('src/components/social/FeedComposer.tsx')
  const channel = await read('src/components/chat/ChatRoom.tsx')
  const dm = await read('src/components/chat/DMRoom.tsx')
  const forum = await read('src/components/forum/ThreadReplyForm.tsx')
  const notifications = await read('src/components/social/NotificationsList.tsx')
  const card = await read('src/components/social/PostCardClient.tsx')
  const invites = await read('src/components/groups/GroupInviteModal.tsx')
  assert.ok(upload.includes("'posts', 'messages', 'stories'"))
  assert.ok(emoji.includes('placeholder="Search emoji"'))
  assert.ok(emoji.includes("localStorage.setItem(RECENTS_KEY"))
  assert.ok(gif.includes("file.type !== 'image/gif'"))
  assert.ok(gif.includes("localStorage.setItem(RECENTS_KEY"))
  assert.ok(text.includes('className="ss-inline-gif"'))
  assert.ok(feed.includes('<GifPicker onSelect={setImageUrl}'))
  assert.ok(channel.includes('uploadKind="messages"'))
  assert.ok(dm.includes('uploadKind="messages"'))
  assert.ok(forum.includes('<GifPicker'))
  assert.ok(card.includes('className="ss-nested-reply-composer"'))
  assert.ok(notifications.includes('onClick={onRead}'))
  assert.ok(invites.includes("from('group_members')"))
  assert.ok(invites.includes("from('group_invites')"))
})

test('social identity and publishing support custom rings and native post modes', async () => {
  const avatar = await read('src/components/social/MemberAvatar.tsx')
  const profile = await read('src/components/settings/ProfileForm.tsx')
  const composer = await read('src/components/social/FeedComposer.tsx')
  const post = await read('src/components/social/PostCardClient.tsx')
  const columns = await read('src/lib/supabase/userColumns.ts')
  const migration = await read('supabase/migrations/20260912143000_add_member_avatar_appearance.sql')
  assert.ok(avatar.includes("ringStyle = 'surge'"))
  assert.ok(avatar.includes("ring-${ringStyle || 'surge'}"))
  assert.ok(profile.includes('ss-profile-ring-editor'))
  assert.ok(profile.includes('avatar_ring_color: form.avatar_ring_color'))
  for (const mode of ['take', 'pick', 'poll', 'research']) assert.ok(composer.includes(`key: '${mode}'`))
  assert.ok(composer.includes("post_type: pollData ? 'poll' : composerMode === 'research' ? 'analysis' : 'text'"))
  assert.ok(post.includes('<ProfileHoverTarget'))
  assert.ok(columns.includes("'avatar_ring_style', 'avatar_ring_color'"))
  assert.ok(migration.includes("check (avatar_ring_style in ('none', 'solid', 'surge', 'pulse', 'orbit'))"))
})

test('Dugout research cards can publish directly into the social feed', async () => {
  const shareModal = await read('src/components/dugout/ShareWatchlistModal.tsx')
  assert.ok(shareModal.includes('postToFeed'))
  assert.ok(shareModal.includes("post_type: 'analysis'"))
  assert.ok(shareModal.includes('uploadMedia('))
  assert.ok(shareModal.includes('router.push(`/posts/${data.id}`)'))
})

test('page owners publish native posts and picks into their page context', async () => {
  const composer = await read('src/components/social/FeedComposer.tsx')
  const page = await read('src/app/pages/[slug]/page.tsx')
  const pickRoute = await read('src/app/api/posts/pick/route.ts')
  assert.ok(composer.includes('pageId?: string'))
  assert.ok(composer.includes('page_id: pageId ?? null'))
  assert.ok(page.includes('<FeedComposer pageId={page.id}'))
  assert.ok(pickRoute.includes("eq('owner_id', user.id)"))
  assert.ok(pickRoute.includes('page_id: pageId'))
})

test('public publishing and follow flows recover without leaking backend errors', async () => {
  const follow = await read('src/components/pages/PageFollowButton.tsx')
  const page = await read('src/components/pages/PageSettingsForm.tsx')
  const blog = await read('src/components/blog/BlogEditor.tsx')
  const listing = await read('src/components/marketplace/CreateListingForm.tsx')
  assert.ok(follow.includes('Not saved · retry'))
  assert.ok(follow.includes('aria-pressed={following}'))
  assert.ok(page.includes('<form className="ss-flow-form" onSubmit={save}>'))
  assert.ok(page.includes('finally {'))
  assert.ok(blog.includes('<SafeImage'))
  assert.ok(blog.includes('isSafeImageUrl(form.cover_image)'))
  assert.ok(!blog.includes('setError(err.message)'))
  assert.ok(listing.includes('<form className="space-y-4"'))
  assert.ok(!listing.includes('setError(err.message)'))
})

test('authentication and onboarding recover without exposing provider failures', async () => {
  const login = await read('src/app/auth/login/page.tsx')
  const register = await read('src/app/auth/register/page.tsx')
  const forgot = await read('src/app/auth/forgot-password/page.tsx')
  const reset = await read('src/app/auth/reset-password/page.tsx')
  const desktopStart = await read('src/app/auth/desktop/start/page.tsx')
  const desktopComplete = await read('src/app/auth/desktop/complete/page.tsx')
  const whopComplete = await read('src/app/auth/whop/complete/page.tsx')
  const security = await read('src/components/settings/SecuritySettingsForm.tsx')
  const onboarding = await read('src/components/onboarding/OnboardingFlow.tsx')
  assert.ok(login.includes("setError('Email or password is incorrect.')"))
  assert.ok(login.includes('autoComplete="current-password"'))
  assert.ok(!login.includes('setError(error.message)'))
  assert.ok(register.includes('/^[a-z0-9._]+$/'))
  assert.ok(register.includes("if (!response.ok)"))
  assert.ok(register.includes('autoComplete="new-password"'))
  assert.ok(!register.includes('setError(signUpError.message)'))
  assert.ok(forgot.includes('<form className="ss-auth-card"'))
  assert.ok(!forgot.includes('setError(err.message)'))
  assert.ok(reset.includes('<form className="ss-auth-card" onSubmit={reset}>'))
  assert.ok(!reset.includes('setError(err.message)'))
  assert.ok(!desktopStart.includes('setError(error.message)'))
  assert.ok(!desktopComplete.includes('setError(error.message)'))
  assert.ok(!whopComplete.includes('setError(error.message)'))
  assert.ok(!security.includes('setError(removeError.message)'))
  assert.ok(!security.includes('setError(signOutError.message)'))
  assert.ok(security.includes("role={error ? 'alert' : 'status'}"))
  assert.ok(onboarding.includes("setError('We could not save your profile."))
  assert.ok(onboarding.includes('aria-pressed={sports.includes(sport)}'))
  assert.ok(onboarding.includes('role="alert"'))
})

test('saved posts hydrate consistently across feed and profile refreshes', async () => {
  const querySource = await read('src/lib/queries.ts')
  const profileSource = await read('src/app/profile/[username]/page.tsx')
  assert.match(querySource, /from\('bookmarks'\)\.select\('post_id'\)/)
  assert.match(querySource, /user_bookmarked: bookmarked\.has\(p\.id\)/)
  assert.doesNotMatch(profileSource, /user_bookmarked:\s*false/)
})

test('forum discussions support durable nested replies and owner-controlled edits', async () => {
  const migration = await read('supabase/migrations/20260912224500_threaded_forum_replies.sql')
  const replyForm = await read('src/components/forum/ThreadReplyForm.tsx')
  const actions = await read('src/components/forum/ForumReplyActions.tsx')
  assert.match(migration, /parent_reply_id uuid references public\.forum_replies\(id\)/)
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = author_id\)/)
  assert.match(replyForm, /parent_reply_id: parentReplyId \?\? null/)
  assert.match(actions, /is_deleted: true/)
})

test('direct-message forwarding preserves context behind a server permission boundary', async () => {
  const migration = await read('supabase/migrations/20260912231500_secure_message_forwarding.sql')
  const picker = await read('src/components/chat/NewDMForm.tsx')
  const room = await read('src/components/chat/DMRoom.tsx')
  assert.match(migration, /source_message\.dm_recipient_id <> actor_id/)
  assert.match(migration, /from public\.blocks/)
  assert.match(migration, /grant execute on function public\.forward_direct_message/)
  assert.match(picker, /rpc\('forward_direct_message'/)
  assert.match(room, /Forwarded/)
})

test('direct-message privacy is enforced by discovery and database writes', async () => {
  const migration = await read('supabase/migrations/20260912234500_enforce_dm_privacy.sql')
  const newMessagePage = await read('src/app/messages/new/page.tsx')
  assert.match(migration, /recipient\.allow_dms = true/)
  assert.match(migration, /create policy "Can send accessible message"/)
  assert.match(newMessagePage, /\.eq\('allow_dms', true\)/)
})

test('creator commerce shares identity, responsive payout states, and entitlement-aware access', async () => {
  const storefront = await read('src/app/creators/[username]/page.tsx')
  const payouts = await read('src/app/creators/payouts/PayoutSetupClient.tsx')
  const offer = await read('src/app/creators/offers/[productId]/page.tsx')
  const checkout = await read('src/app/creators/offers/[productId]/CheckoutButton.tsx')
  assert.match(storefront, /<MemberAvatar/)
  assert.match(payouts, /CreatorPayouts\.module\.css/)
  assert.doesNotMatch(payouts, /style=\{\{/)
  assert.match(offer, /creator_entitlements/)
  assert.match(offer, /ACCESS ACTIVE/)
  assert.match(checkout, /aria-busy=\{loading\}/)
})

test('global discovery prevents stale search races and preserves removable recent searches', async () => {
  const search = await read('src/components/search/SearchClient.tsx')
  assert.match(search, /searchRunRef\.current/)
  assert.match(search, /runId !== searchRunRef\.current/)
  assert.match(search, /slipsurge:recent-searches/)
  assert.match(search, /Remove \$\{item\} from recent searches/)
  assert.match(search, /aria-busy=\{loading\}/)
})

test('application routes expose one top-level main landmark without nested page mains', async () => {
  const files = [...await sourceFiles('src/app'), ...await sourceFiles('src/components')]
  const withMain = []
  for (const file of files) if ((await read(file)).includes('<main')) withMain.push(file.replaceAll('\\', '/'))
  assert.deepEqual(withMain.sort(), [
    'src/app/global-error.tsx',
    'src/components/admin/AdminShell.tsx',
    'src/components/layout/RootLayoutShell.tsx',
  ])
})

test('watchlist research sharing preserves sport context and accessible modal behavior', async () => {
  const share = await read('src/components/dugout/ShareWatchlistModal.tsx')
  const watchlist = await read('src/components/dugout/WatchlistPanel.tsx')
  assert.match(share, /<ModalSurface/)
  assert.match(share, /sport === 'NFL' \? 'Sideline research card'/)
  assert.match(share, /sport,\s*\n\s*media_urls/)
  assert.match(watchlist, /sport=\{pendingItems\.length/)
})

test('activity center supports scoped read state and safe internal deep links', async () => {
  const notifications = await read('src/components/social/NotificationsList.tsx')
  assert.match(notifications, /Mark section read/)
  assert.match(notifications, /!link\.startsWith\('\/\/'\)/)
  assert.match(notifications, /const href = notificationHref\(latest\.link\)/)
})

test('matrix marketplace preserves universal creator identity themes', async () => {
  const route = await read('src/app/api/matrix-marketplace/route.ts')
  const listing = await read('src/components/marketplace/MatrixMarketplaceClient.tsx')
  const detail = await read('src/components/marketplace/MatrixMarketplaceDetailClient.tsx')
  assert.match(route, /avatar_ring_style, avatar_ring_color/)
  assert.match(listing, /ringStyle=\{listing\.author\?\.avatar_ring_style\}/)
  assert.match(detail, /ringColor=\{listing\.author\?\.avatar_ring_color\}/)
  assert.match(listing, /controller\.abort\(\)/)
  assert.match(listing, /Marketplace could not load/)
  assert.match(listing, /aria-pressed=\{mine\}/)
})

test('publishing and social previews use resilient media and accessible share surfaces', async () => {
  const library = await read('src/app/blog/my/page.tsx')
  const article = await read('src/app/blog/[slug]/page.tsx')
  const editor = await read('src/components/blog/BlogEditor.tsx')
  const draftAssistant = await read('src/components/blog/AIBlogWriter.tsx')
  const story = await read('src/components/social/CreateStoryForm.tsx')
  const share = await read('src/components/social/ShareImageModal.tsx')
  const badges = await read('src/components/social/UserBadges.tsx')
  assert.match(library, /<SafeImage/)
  assert.match(article, /avatar_ring_style, avatar_ring_color/)
  assert.match(article, /<SafeImage/)
  assert.match(editor, /role="tablist" aria-label="Article editor view"/)
  assert.match(editor, /<ArticlePreview form=\{form\}/)
  assert.match(draftAssistant, /\.select\('id'\)\.single\(\)/)
  assert.match(draftAssistant, /router\.push\(`\/blog\/edit\/\$\{data\.id\}`\)/)
  assert.match(story, /<SafeImage src=\{preview\}/)
  assert.match(share, /<ModalSurface/)
  assert.match(share, /labelledBy="share-pick-title"/)
  assert.match(badges, /ss-user-badge-fallback/)
})

test('sports entity hubs bound upstream waits and preserve failed media layouts', async () => {
  const mlbTeam = await read('src/app/mlb/teams/[id]/page.tsx')
  const nflPlayer = await read('src/app/nfl/players/[id]/page.tsx')
  assert.match(mlbTeam, /AbortSignal\.timeout\(8000\)/)
  assert.match(mlbTeam, /catch \{\s*return null/)
  assert.match(nflPlayer, /<SafeImage src=\{player\.headshot\}/)
  assert.ok(!nflPlayer.includes('<img src={player.headshot}'))
})

test('member mastery is private, server verified, and derived from durable activity', async () => {
  const migration = await read('supabase/migrations/20260912173019_member_mastery.sql')
  const page = await read('src/app/missions/page.tsx')
  assert.match(migration, /security definer/)
  assert.match(migration, /uuid := auth\.uid\(\)/)
  assert.match(migration, /from public\.posts where author_id = member_id/)
  assert.match(migration, /from public\.research_notes where user_id = member_id/)
  assert.match(migration, /on conflict do nothing/)
  assert.match(migration, /revoke all on function public\.get_member_mastery\(\) from public, anon/)
  assert.match(page, /redirect\('\/auth\/login\?next=\/missions'\)/)
  assert.match(page, /rpc\('get_member_mastery'\)/)
  assert.match(page, /aria-label=\{Math\.round\(levelProgress\)/)
})

test('group conversations support durable reactions and owner-managed membership', async () => {
  const migration = await read('supabase/migrations/20260912173823_group_conversation_controls.sql')
  const room = await read('src/components/chat/GroupDMRoom.tsx')
  assert.match(migration, /create table if not exists public\.group_message_reactions/)
  assert.match(migration, /private\.is_group_conversation_member/)
  assert.match(migration, /conversation_owner is distinct from actor_id/)
  assert.match(migration, /count\(\*\).*>= 20/)
  assert.match(migration, /from public\.blocks block/)
  assert.match(migration, /revoke all on function public\.manage_group_conversation_member/)
  assert.match(room, /aria-pressed=\{active\}/)
  assert.match(room, /rpc\(\s*"manage_group_conversation_member"/)
  assert.match(room, /Reaction not updated\. Try again\./)
})

test('Sideline Market Moments preserve an exact validated capture deep link', async () => {
  const page = await read('src/app/the-sideline/page.tsx')
  const board = await read('src/app/the-sideline/SidelineBoardClient.tsx')
  const hook = await read('src/app/the-sideline/useSidelineMarket.ts')
  assert.match(page, /Number\.isFinite\(Date\.parse\(requestedCaptureValue\)\)/)
  assert.match(page, /initialCapture=\{requestedCapture\}/)
  assert.match(hook, /useState<string \| null>\(initialCapture \?\? null\)/)
  assert.match(board, /url\.searchParams\.set\('at', new Date\(frameTime\)\.toISOString\(\)\)/)
  assert.match(board, /aria-label="Share this Market Story capture"/)
  assert.match(board, /navigator\.share/)
})

test('spoiler controls persist across every social post type and require explicit reveal', async () => {
  const migration = await read('supabase/migrations/20260912175337_post_spoiler_controls.sql')
  const composer = await read('src/components/social/FeedComposer.tsx')
  const pickRoute = await read('src/app/api/posts/pick/route.ts')
  const card = await read('src/components/social/PostCardClient.tsx')
  assert.match(migration, /is_spoiler boolean not null default false/)
  assert.match(composer, /is_spoiler: isSpoiler/)
  assert.match(composer, /isSpoiler,\s*\n/)
  assert.match(composer, /aria-pressed=\{isSpoiler\}/)
  assert.match(pickRoute, /const isSpoiler = body\?\.isSpoiler === true/)
  assert.match(pickRoute, /is_spoiler: isSpoiler/)
  assert.match(card, /post\.is_spoiler && !spoilerRevealed/)
  assert.match(card, /setSpoilerRevealed\(true\)/)
})

test('member context handoff is private, bounded, and restores exact product state', async () => {
  const migration = await read('supabase/migrations/20260912175919_member_context_handoff.sql')
  const handoff = await read('src/components/layout/ContextHandoff.tsx')
  const shell = await read('src/components/layout/RootLayoutShell.tsx')
  assert.match(migration, /alter table public\.member_context_handoff enable row level security/)
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/)
  assert.match(migration, /path !~ '\^\/\(api\|auth\|admin\)/)
  assert.match(migration, /scroll_y between 0 and 10000000/)
  assert.match(handoff, /sessionStorage\.setItem\(RESTORE_KEY, remoteContext\.path\)/)
  assert.match(handoff, /window\.scrollTo\(\{ top: saved\.scroll_y/)
  assert.match(handoff, /SYNC_DELAY_MS = 30_000/)
  assert.match(handoff, /navigator\.onLine/)
  assert.match(shell, /<Suspense fallback=\{null\}><ContextHandoff \/><\/Suspense>/)
})

test('Activity Replay is private, durable, bounded, and universally reachable', async () => {
  const migration = await read('supabase/migrations/20260912180609_member_activity_replay.sql')
  const page = await read('src/app/activity/page.tsx')
  const desktop = await read('src/components/desktop/DesktopNavigation.tsx')
  const mobile = await read('src/components/layout/Sidebar.tsx')
  const commands = await read('src/components/layout/GlobalCommandPalette.tsx')
  assert.match(migration, /alter table public\.member_activity_events enable row level security/)
  assert.match(migration, /revoke all on table public\.member_activity_events from public, anon, authenticated/)
  assert.match(migration, /create trigger capture_post_member_activity/)
  assert.match(migration, /create trigger capture_reaction_member_activity/)
  assert.match(migration, /create trigger capture_research_note_member_activity/)
  assert.match(migration, /created_at >= now\(\) - interval '365 days'/)
  assert.match(page, /redirect\('\/auth\/login\?next=\/activity'\)/)
  assert.match(page, /\.eq\('user_id', user\.id\)/)
  assert.match(page, /\.limit\(150\)/)
  assert.match(desktop, /href: '\/activity'/)
  assert.match(mobile, /href: '\/activity'/)
  assert.match(commands, /id: 'activity'/)
})

test('Dugout Market Moments restore and share an exact validated capture', async () => {
  const dugout = await read('src/components/dugout/DugoutClient.tsx')
  assert.match(dugout, /Number\.isFinite\(Date\.parse\(requestedCaptureValue\)\)/)
  assert.match(dugout, /requestedCaptureAppliedRef/)
  assert.match(dugout, /Math\.abs\(Date\.parse\(point\.capturedAt\) - target\)/)
  assert.match(dugout, /url\.searchParams\.set\('at', new Date\(selectedTimelinePoint\.capturedAt\)\.toISOString\(\)\)/)
  assert.match(dugout, /aria-label="Share this Market Story capture"/)
  assert.match(dugout, /navigator\.share/)
})

test('Community onboarding is durable, member-private, channel-bound, and permission-safe', async () => {
  const migration = await read('supabase/migrations/20260913000000_community_member_onboarding.sql')
  const onboarding = await read('src/components/groups/GroupMemberOnboarding.tsx')
  const groupPage = await read('src/app/groups/[slug]/page.tsx')
  const settings = await read('src/components/groups/GroupSettingsForm.tsx')
  assert.match(migration, /foreign key \(group_id, user_id\)\s+references public\.group_members/)
  assert.match(migration, /alter table public\.group_member_preferences enable row level security/)
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/)
  assert.match(migration, /channel\.group_id = p_group_id/)
  assert.match(migration, /p_notification_level not in \('all', 'highlights', 'mentions', 'muted'\)/)
  assert.match(migration, /community\.owner_id = auth\.uid\(\)/)
  assert.doesNotMatch(onboarding, /owner|admin|moderator/)
  assert.match(onboarding, /rpc\('save_group_member_onboarding'/)
  assert.match(onboarding, /role="alert"/)
  assert.match(groupPage, /setup === 'community'/)
  assert.match(settings, /rpc\('set_community_group_rules'/)
})

test('Community groups provide secure multi-channel workspaces and staff-only announcements', async () => {
  const migration = await read('supabase/migrations/20260913001000_community_channel_workspaces.sql')
  const manager = await read('src/components/groups/GroupChannelManager.tsx')
  const workspace = await read('src/components/groups/GroupChannelWorkspace.tsx')
  const groupPage = await read('src/app/groups/[slug]/page.tsx')
  const chat = await read('src/components/chat/ChatRoom.tsx')
  assert.match(migration, /channel_kind in \('text', 'live', 'picks', 'announcements'\)/)
  assert.match(migration, /private\.can_manage_group_channels/)
  assert.match(migration, /membership\.role in \('owner', 'admin', 'moderator'\)/)
  assert.match(migration, /p_channel_id = v_primary_channel_id/)
  assert.match(migration, /private\.can_post_channel\(channel_id/)
  assert.match(manager, /rpc\('create_group_channel'/)
  assert.match(manager, /rpc\('update_group_channel'/)
  assert.match(manager, /rpc\('delete_group_channel'/)
  assert.match(workspace, /aria-label="Community channels"/)
  assert.match(groupPage, /requestedChannel/)
  assert.match(groupPage, /readOnly=\{activeChannel\.channel_kind === 'announcements'/)
  assert.match(chat, /Only community staff can post in this channel/)
})

test('direct messages provide private durable pins, search, and shared-media navigation', async () => {
  const migration = await read('supabase/migrations/20260913002000_dm_conversation_tools.sql')
  const room = await read('src/components/chat/DMRoom.tsx')
  const tools = await read('src/components/chat/DMConversationTools.tsx')
  const page = await read('src/app/messages/[username]/page.tsx')
  assert.match(migration, /alter table public\.message_pins enable row level security/)
  assert.match(migration, /private\.can_access_message\(message\.id/)
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/)
  assert.match(room, /from\('message_pins'\)\.insert/)
  assert.match(room, /aria-pressed=\{pinnedMessageIds\.has\(m\.id\)\}/)
  assert.match(room, /aria-label="Conversation tools"/)
  assert.match(tools, /role="tablist" aria-label="Conversation tools"/)
  assert.match(tools, /message\.content\?\.toLocaleLowerCase\(\)\.includes/)
  assert.match(tools, /message\.media_urls\?\.length/)
  assert.match(page, /initialPinnedMessageIds/)
})

test('creator analytics are durable, bounded, deduplicated, and derived from successful commerce', async () => {
  const migration = await read('supabase/migrations/20260913003000_creator_funnel_analytics.sql')
  const route = await read('src/app/api/creator/funnel/route.ts')
  const signal = await read('src/components/creator/CreatorFunnelSignal.tsx')
  const studio = await read('src/app/creators/studio/page.tsx')
  const client = await read('src/app/creators/studio/CreatorStudioClient.tsx')
  const dashboard = await read('src/app/creators/studio/CreatorAnalyticsDashboard.tsx')
  assert.match(migration, /alter table public\.creator_funnel_events enable row level security/)
  assert.match(migration, /creator_id = \(select auth\.uid\(\)\)/)
  assert.match(migration, /creator_funnel_events_session_unique/)
  assert.match(migration, /private\.check_rate_limit\('creator-funnel:'/)
  assert.match(migration, /on conflict do nothing/)
  assert.match(migration, /revoke all on public\.creator_funnel_events from public, anon, authenticated/)
  assert.match(route, /new URL\(origin\)\.host !== request\.nextUrl\.host/)
  assert.match(route, /'Cache-Control': 'no-store'/)
  assert.match(signal, /window\.sessionStorage\.getItem\(key\)/)
  assert.match(signal, /keepalive: true/)
  assert.match(studio, /event_type === 'payment\.succeeded'/)
  assert.match(studio, /\.limit\(5000\)/)
  assert.match(studio, /retentionRate:/)
  assert.match(client, /<CreatorAnalyticsDashboard analytics=\{analytics\} \/>/)
  assert.match(dashboard, /AUDIENCE FUNNEL/)
  assert.match(dashboard, /OFFER PERFORMANCE/)
  assert.match(dashboard, /role="table"/)
})

test('final Game Rooms summarize exact settled picks and durable community contribution', async () => {
  const room = await read('src/components/community/GameRoom.tsx')
  const sharedGame = await read('src/app/sports/[sport]/[gameId]/GameDetailClient.tsx')
  const mlbGame = await read('src/app/sports/[sport]/[gameId]/MLBGameClient.tsx')
  assert.match(room, /if \(phase !== 'post'\) return null/)
  assert.match(room, /String\(leg\.game_pk\) === String\(gameId\)/)
  assert.match(room, /gamePickResult\(pick, gameId\) === 'win'/)
  assert.match(room, /What the community called/)
  assert.match(room, /TOP CONTRIBUTORS/)
  assert.match(room, /href=\{`\/posts\/\$\{pick\.id\}`\}/)
  assert.match(sharedGame, /picks=\{communityPicks\}/)
  assert.match(mlbGame, /picks=\{communityPicks\}/)
})
