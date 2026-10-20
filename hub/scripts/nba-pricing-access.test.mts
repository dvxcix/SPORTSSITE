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
const monthly = ['plan_C0wvFkX0sqiPm', 'plan_3QSVT9Mr4cxVt', 'plan_tCrVAX62uKyEq']
const annual = ['plan_C0wvFkX0sqiPm', 'plan_3HbuZZv6vhNu9', 'plan_1eWRTXv0XXTrI']
function render(props: Partial<PricingProps>, interval: 'monthly' | 'annual' = 'monthly') {
  const children = ({ children }: { children?: React.ReactNode }) => jsxRuntime.jsx('div', { children })
  const empty = () => null
  const imports: Record<string, unknown> = {
    'react': { useState: () => [interval, () => {}] }, 'react/jsx-runtime': jsxRuntime,
    'next/link': { default: ({ href, children }: { href: string; children: React.ReactNode }) => jsxRuntime.jsx('a', { href, children }) },
    'next/dynamic': { default: () => empty }, 'motion/react': { motion: { div: children } },
    'lucide-react': { Check: empty, X: empty, ShieldCheck: empty },
    './PricingCheckoutButton': { PricingCheckoutButton: ({ planId, label }: { planId: string; label: string }) => jsxRuntime.jsx('button', { 'data-plan': planId, children: label }) },
    '@/components/ui/spotlight': { Spotlight: empty }, '@/components/ui/background-beams': { BackgroundBeams: empty },
    '@/components/ui/comet-card': { CometCard: children }, '@/components/ui/Switch': { Switch: empty },
    '@/components/ui/badge': { Badge: children }, '@/components/ui/button': { buttonVariants: () => '' },
    '@/lib/utils': { cn: (...values: unknown[]) => values.filter(Boolean).join(' ') },
    './PricingClient.module.css': { default: new Proxy({}, { get: (_target, key) => String(key) }) },
  }
  const target = { exports: {} as { PricingClient: typeof PricingClient } }
  new Function('require', 'exports', 'module', compiled)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target.exports, target)
  const html = renderToStaticMarkup(jsxRuntime.jsx(target.exports.PricingClient, { loggedIn: true, currentTier: 'free', checkoutStatus: null, ...props }))
  const document = new JSDOM(html).window.document
  return { document, plans: [...document.querySelectorAll('[data-plan]')].map(node => node.getAttribute('data-plan')), ultimate: document.querySelector('#plan-ultimate')! }
}

test('beta without Ultimate retains the exact Ultimate checkout in monthly and annual billing, while lower cards remain covered', () => {
  for (const interval of ['monthly', 'annual'] as const) {
    const view = render({ fullAccessReason: 'beta', rawTier: 'free', currentTier: 'free' }, interval)
    assert.deepEqual(view.plans, [(interval === 'monthly' ? monthly : annual)[2]])
    assert.match(view.document.body.textContent ?? '', /NBA research requires Ultimate/)
    assert.equal(view.ultimate.querySelector('[data-plan]')?.textContent, interval === 'monthly' ? 'Start 3-Day Trial' : 'Get Ultimate')
  }
})

test('paid and admin-granted Ultimate beta users are never offered redundant purchases; admins retain full access', () => {
  const paid = render({ fullAccessReason: 'beta', rawTier: 'ultimate', currentTier: 'ultimate' })
  assert.deepEqual(paid.plans, []); assert.match(paid.ultimate.textContent ?? '', /Manage \/ Cancel/)
  const granted = render({ fullAccessReason: 'beta', rawTier: 'free', currentTier: 'ultimate', adminGrantedTier: 'ultimate' })
  assert.deepEqual(granted.plans, []); assert.match(granted.ultimate.textContent ?? '', /Granted by admin/)
  assert.doesNotMatch(granted.ultimate.textContent ?? '', /Manage \/ Cancel/)
  const admin = render({ fullAccessReason: 'admin', rawTier: 'free', currentTier: 'free' })
  assert.deepEqual(admin.plans, []); assert.match(admin.document.body.textContent ?? '', /Admin account/)
})

test('ordinary member and guest pricing retains existing plan IDs, current-plan management and signup path', () => {
  for (const interval of ['monthly', 'annual'] as const) {
    assert.deepEqual(render({}, interval).plans, interval === 'monthly' ? monthly : annual)
    const advanced = render({ rawTier: 'advanced', currentTier: 'advanced' }, interval)
    assert.deepEqual(advanced.plans, [(interval === 'monthly' ? monthly : annual)[2]])
    assert.match(advanced.document.querySelector('#plan-advanced')?.textContent ?? '', /Manage \/ Cancel/)
    assert.deepEqual(render({ rawTier: 'ultimate', currentTier: 'ultimate' }, interval).plans, [])
  }
  const guest = render({ loggedIn: false })
  assert.deepEqual(guest.plans, monthly)
  assert.equal(guest.document.querySelector('a[href="/auth/register"]')?.textContent, 'Sign Up Free')
})
