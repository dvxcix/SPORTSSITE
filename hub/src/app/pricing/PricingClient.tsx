'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Tier } from '@/lib/tiers'
import { PricingCheckoutButton } from './PricingCheckoutButton'

type Interval = 'monthly' | 'annual'

type TierDef = {
  tier: Tier
  label: string
  monthlyPlanId?: string
  annualPlanId?: string
  features: string[]
}

// Feature lists mirror the enforcement config used by TierGate/requireTier
// call sites — if a page's required tier ever changes, update it here too so
// this marketing copy can't drift from what's actually gated.
const TIERS: TierDef[] = [
  {
    tier: 'free', label: 'Free',
    features: ['Create an account', 'View posts & profiles', 'Edit your own profile'],
  },
  {
    tier: 'basic', label: 'Basic', monthlyPlanId: 'plan_C0wvFkX0sqiPm',
    features: [
      'Everything in Free', 'Forum, Blog & Marketplace', 'Messages, Stories & Events',
      'Notifications, Groups & Channels', 'Leaderboard', 'Player Pages & Search',
      'Live Scores', 'Pitcher Report', 'Weather Lab',
    ],
  },
  {
    tier: 'advanced', label: 'Advanced', monthlyPlanId: 'plan_3QSVT9Mr4cxVt', annualPlanId: 'plan_3HbuZZv6vhNu9',
    features: ['Everything in Basic', 'Slate Breakdown'],
  },
  {
    tier: 'ultimate', label: 'Ultimate', monthlyPlanId: 'plan_tCrVAX62uKyEq', annualPlanId: 'plan_1eWRTXv0XXTrI',
    features: ['Everything in Advanced', 'Dugout', 'Batter Cost'],
  },
]

export function PricingClient({ loggedIn, currentTier }: { loggedIn: boolean; currentTier: Tier }) {
  const [interval, setInterval] = useState<Interval>('monthly')

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-1)', marginBottom: 8 }}>Plans & Pricing</h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Pick the tier that fits how deep you want to go.</p>

        <div style={{
          display: 'inline-flex', marginTop: 20, background: 'var(--surface-2)', borderRadius: 10, padding: 3,
        }}>
          {(['monthly', 'annual'] as Interval[]).map(i => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              style={{
                fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: interval === i ? 'var(--accent)' : 'transparent',
                color: interval === i ? 'var(--accent-fg)' : 'var(--text-3)',
              }}
            >
              {i === 'monthly' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16,
      }}>
        {TIERS.map(t => {
          const isCurrent = t.tier === currentTier
          // Basic has no annual plan — always falls back to its one monthly plan.
          const planId = interval === 'annual' && t.annualPlanId ? t.annualPlanId : t.monthlyPlanId

          return (
            <div key={t.tier} style={{
              background: 'var(--surface-1)', border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>{t.label}</h2>
                {isCurrent && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--accent-fg)', background: 'var(--accent)',
                    padding: '3px 8px', borderRadius: 999,
                  }}>
                    Current
                  </span>
                )}
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 20px', flex: 1 }}>
                {t.features.map(f => (
                  <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontSize: 13, color: 'var(--text-2)' }}>
                    <Check size={14} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {planId && !isCurrent && (
                <PricingCheckoutButton planId={planId} label={`Get ${t.label}`} loggedIn={loggedIn} />
              )}
              {t.tier === 'free' && !isCurrent && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>Default for new accounts</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
