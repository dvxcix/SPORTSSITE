import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
// @ts-expect-error jsdom is runtime-only here and has no installed declarations.
import { JSDOM } from 'jsdom'
import type { PricingClient } from '../src/app/pricing/PricingClient'

type PricingProps = Parameters<typeof PricingClient>[0]
const source = await readFile(new URL('../src/app/pricing/PricingClient.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText

function render(props: Partial<PricingProps> = {}, interval: 'monthly' | 'annual' = 'monthly') {
  const empty = () => null
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': jsxRuntime,
    'react': { useState: () => [interval, () => {}] },
    'next/link': { default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => jsxRuntime.jsx('a', { href, ...rest, children }) },
    'lucide-react': { Check: empty, X: empty, ShieldCheck: empty },
    '@slipsurge/core/tiers': { ULTIMATE_CHECKOUT_PLAN_ID: 'plan_2uISqRWL3Re5v', ULTIMATE_ANNUAL_CHECKOUT_PLAN_ID: 'plan_Brp4I5MDssXY0' },
    './PricingCheckoutButton': { PricingCheckoutButton: ({ planId, label }: { planId: string; label: string }) => jsxRuntime.jsx('button', { 'data-plan': planId, children: label }) },
    '@/components/ui/button': { buttonVariants: () => '' },
    '@/lib/utils': { cn: (...values: unknown[]) => values.filter(Boolean).join(' ') },
    './PricingClient.module.css': { default: new Proxy({}, { get: (_target, key) => String(key) }) },
  }
  const target = { exports: {} as { PricingClient: typeof PricingClient } }
  new Function('require', 'exports', 'module', compiled)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target.exports, target)
  const html = renderToStaticMarkup(jsxRuntime.jsx(target.exports.PricingClient, { loggedIn: true, currentTier: 'free', checkoutStatus: null, ...props }))
  const document = new JSDOM(html).window.document
  return { document, plans: [...document.querySelectorAll('[data-plan]')].map(node => node.getAttribute('data-plan')), ultimate: document.querySelector('#plan-ultimate')! }
}

test('guests and free members see only the new monthly Ultimate offer and its exact checkout', () => {
  for (const props of [{ loggedIn: false }, { loggedIn: true }] as const) {
    const view = render(props)
    assert.deepEqual([...view.document.querySelectorAll('h2')].map(node => node.textContent), ['Free', 'Ultimate'])
    assert.deepEqual(view.plans, ['plan_2uISqRWL3Re5v'])
    assert.match(view.ultimate.textContent ?? '', /\$19\.99/)
    assert.match(view.ultimate.textContent ?? '', /Monthly price for new memberships/)
    assert.match(view.ultimate.textContent ?? '', /3-day free trial, then \$19\.99 every 30 days/)
    assert.equal(view.ultimate.querySelector('[data-plan]')?.textContent, 'Start 3-day free trial')
  }
  assert.ok(render({ loggedIn: false }).document.querySelector('a[href="/auth/register"]'))
})

test('annual pricing is $199.99 for 365 days and uses the verified new annual plan', () => {
  const scenarios: Partial<PricingProps>[] = [{ loggedIn: false }, { loggedIn: true }, { rawTier: 'ultimate', currentTier: 'ultimate' }]
  for (const props of scenarios) {
    const view = render(props, 'annual')
    assert.match(view.ultimate.textContent ?? '', /\$199\.99\/365 days/)
    assert.match(view.ultimate.textContent ?? '', /Annual price for new memberships/)
    assert.match(view.ultimate.textContent ?? '', /renew every 365 days/)
    assert.deepEqual(view.plans, props.currentTier === 'ultimate' ? [] : ['plan_Brp4I5MDssXY0'])
    assert.doesNotMatch(view.ultimate.textContent ?? '', /free trial/i)
    assert.equal(view.document.querySelector('button[aria-pressed="true"]')?.textContent, 'Annual')
  }
})

test('legacy paid memberships retain their labels and cannot start a second subscription', () => {
  for (const tier of ['basic', 'advanced'] as const) {
    const view = render({ rawTier: tier, currentTier: tier })
    assert.deepEqual(view.plans, [])
    assert.match(view.document.body.textContent ?? '', new RegExp(`existing ${tier} membership`, 'i'))
    assert.ok(view.ultimate.querySelector('a[href="/settings/membership"]'))
    assert.doesNotMatch(view.document.querySelector('#plan-free')?.textContent ?? '', /Current/)
  }
})

test('paid and granted Ultimate and admin accounts do not offer duplicate checkout', () => {
  const paid = render({ rawTier: 'ultimate', currentTier: 'ultimate' })
  assert.deepEqual(paid.plans, [])
  assert.ok(paid.ultimate.querySelector('a[href="/settings/membership"]'))
  const granted = render({ rawTier: 'free', currentTier: 'ultimate', adminGrantedTier: 'ultimate' })
  assert.deepEqual(granted.plans, [])
  assert.equal(granted.ultimate.querySelector('a[href="/settings/membership"]'), null)
  const admin = render({ fullAccessReason: 'admin', rawTier: 'free', currentTier: 'free' })
  assert.deepEqual(admin.plans, [])
  assert.match(admin.document.body.textContent ?? '', /Admin account/)
})

test('beta members can get Ultimate; eligible Discord members are directed to their offer', () => {
  assert.deepEqual(render({ fullAccessReason: 'beta', rawTier: 'free', currentTier: 'free' }).plans, ['plan_2uISqRWL3Re5v'])
  const discord = render({ discordAdvancedClaimed: true, rawTier: 'free', currentTier: 'free' })
  assert.deepEqual(discord.plans, [])
  assert.match(discord.ultimate.textContent ?? '', /View Discord member offer/)
  assert.ok(discord.ultimate.querySelector('a[href="/settings/membership"]'))
  const betaDiscord = render({ fullAccessReason: 'beta', discordAdvancedClaimed: true, rawTier: 'free', currentTier: 'free' })
  assert.deepEqual(betaDiscord.plans, [])
  assert.ok(betaDiscord.ultimate.querySelector('a[href="/settings/membership"]'))
})

test('a paid-feature gate offers the available membership while a free feature asks guests to sign in', async () => {
  const gateSource = await readFile(new URL('../src/components/layout/TierUpsell.tsx', import.meta.url), 'utf8')
  const gateCode = ts.transpileModule(gateSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const target = { exports: {} as { TierUpsell: (props: { requiredTier: string; label: string }) => React.ReactElement } }
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': jsxRuntime,
    'next/link': { default: ({ href, children }: { href: string; children: React.ReactNode }) => jsxRuntime.jsx('a', { href, children }) },
    'lucide-react': { Lock: () => null },
    '@/components/desktop/DesktopUpgradePrompt': { DesktopUpgradePrompt: () => null },
  }
  new Function('require', 'exports', 'module', gateCode)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target.exports, target)
  for (const tier of ['basic', 'advanced', 'ultimate']) {
    const html = renderToStaticMarkup(jsxRuntime.jsx(target.exports.TierUpsell, { requiredTier: tier, label: 'Research' }))
    assert.match(html, /Unlock Research with Ultimate/)
    assert.match(html, /href="\/pricing"/)
  }
  const free = renderToStaticMarkup(jsxRuntime.jsx(target.exports.TierUpsell, { requiredTier: 'free', label: 'Research' }))
  assert.match(free, /Sign in to use Research/)
  assert.match(free, /href="\/auth\/login"/)
})

test('membership settings distinguish cancellation and Discord eligibility without a change-plan loop', async () => {
  const source = await readFile(new URL('../src/app/settings/membership/page.tsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  async function settings(profile: Record<string, unknown>, whopLinked = false) {
    const empty = () => null
    const imports: Record<string, unknown> = {
      'react/jsx-runtime': jsxRuntime,
      'next/link': { default: ({ href, children }: { href: string; children: React.ReactNode }) => jsxRuntime.jsx('a', { href, children }) },
      'next/navigation': { redirect: () => { throw new Error('unexpected redirect') } },
      '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }) }) },
      '@slipsurge/core/tiers': { WHOP_PLANS: { plan: { label: 'Ultimate — Annual' } }, effectiveTier: (tier: string) => tier, hasTierAccess: (tier: string, required: string) => tier === 'ultimate' || tier === required },
      '@/app/pricing/PricingCheckoutButton': { PricingCheckoutButton: ({ label }: { label: string }) => jsxRuntime.jsx('button', { children: label }) },
      './CancelMembershipButton': { CancelMembershipButton: empty },
      'lucide-react': { CheckCircle2: empty, XCircle: empty, Clock: empty },
      '@/components/settings/SettingsShell': { SettingsShell: ({ children }: { children: React.ReactNode }) => jsxRuntime.jsx('main', { children }) },
      './MembershipSettings.module.css': { default: new Proxy({}, { get: (_target, key) => String(key) }) },
    }
    const target = { exports: {} as { default: (props: unknown) => Promise<React.ReactElement> } }
    new Function('require', 'exports', 'module', code)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target.exports, target)
    return new JSDOM(renderToStaticMarkup(await target.exports.default({ searchParams: Promise.resolve({ whop_linked: whopLinked ? '1' : undefined }) }))).window.document
  }
  const canceled = await settings({ tier: 'ultimate', tier_status: 'active', tier_cancel_at_period_end: true, tier_current_period_end: '2030-01-01T12:00:00.000Z', whop_plan_id: 'plan', discord_advanced_claimed: true }, true)
  assert.match(canceled.body.textContent ?? '', /ends January 1, 2030/)
  assert.doesNotMatch(canceled.body.textContent ?? '', /renews|offer is available|Change Plan/)
  assert.equal(canceled.querySelector('a[href="/pricing"]'), null)
  const discord = await settings({ tier: 'free', discord_advanced_claimed: true, beta_access_active: true }, true)
  assert.match(discord.body.textContent ?? '', /offer is available below/)
  assert.match(discord.body.textContent ?? '', /Add Ultimate — \$10\/mo/)
  assert.ok(discord.querySelector('a[href="/pricing"]'))
})
