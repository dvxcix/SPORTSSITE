'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import type { Tier } from '@/lib/tiers'
import { PricingCheckoutButton } from './PricingCheckoutButton'

type Interval = 'monthly' | 'annual'

type TierDef = {
  tier: Tier
  label: string
  tagline: string
  monthlyPlanId?: string
  annualPlanId?: string
  monthlyPrice?: number
  annualPrice?: number
  highlight?: 'popular' | 'premium'
}

const TIERS: TierDef[] = [
  { tier: 'free', label: 'Free', tagline: 'For casual fans just browsing the community.' },
  {
    tier: 'basic', label: 'Basic', tagline: 'For bettors ready to dig into real research.',
    monthlyPlanId: 'plan_C0wvFkX0sqiPm', monthlyPrice: 9.99,
  },
  {
    tier: 'advanced', label: 'Advanced', tagline: 'For sharps who track the market before it moves.',
    monthlyPlanId: 'plan_3QSVT9Mr4cxVt', annualPlanId: 'plan_3HbuZZv6vhNu9',
    monthlyPrice: 24.99, annualPrice: 249.99, highlight: 'popular',
  },
  {
    tier: 'ultimate', label: 'Ultimate', tagline: 'Every tool, every edge — for serious bettors only.',
    monthlyPlanId: 'plan_tCrVAX62uKyEq', annualPlanId: 'plan_1eWRTXv0XXTrI',
    monthlyPrice: 34.99, annualPrice: 329.99, highlight: 'premium',
  },
]

// One consistent row set across every card, so a visitor can scan straight
// down a column and see exactly where their money stops going — same
// pattern the reference pricing page used (Starter and Pro share almost the
// entire checklist, only diverging at the bottom). Row -> minimum tier that
// unlocks it; drives both the check/x rendering AND keeps this marketing
// copy impossible to drift from what TierGate/requireTier actually enforce,
// since it's read off the same Tier rank.
const TIER_RANK: Record<Tier, number> = { free: 0, basic: 1, advanced: 2, ultimate: 3 }
const FEATURE_ROWS: { label: string; minTier: Tier }[] = [
  { label: 'Community access — posts, DMs, groups, channels & notifications', minTier: 'basic' },
  { label: 'Community leaderboard', minTier: 'basic' },
  { label: 'Player research & search', minTier: 'basic' },
  { label: 'Live scores & play-by-play', minTier: 'basic' },
  { label: 'Pitcher Report + Weather Lab', minTier: 'basic' },
  { label: 'Full Slate Breakdown', minTier: 'advanced' },
  { label: 'The Dugout — live game analytics', minTier: 'ultimate' },
  { label: 'Line Movement Tracker', minTier: 'ultimate' },
]
const FREE_ROWS = ['Browse the community feed', 'View & manage your profile']

export function PricingClient({ loggedIn, currentTier }: { loggedIn: boolean; currentTier: Tier }) {
  const [interval, setInterval] = useState<Interval>('monthly')

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '56px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, color: 'var(--text-1)', marginBottom: 10, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          Bet smarter, not <span style={{ color: 'var(--accent)' }}>harder.</span>
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-3)', maxWidth: 480, margin: '0 auto' }}>
          Free tools to get started. Upgrade for live analytics, line movement, and the deepest breakdown on the slate.
        </p>

        <div style={{
          display: 'inline-flex', marginTop: 24, background: 'var(--surface-2)', borderRadius: 10, padding: 3, gap: 2,
        }}>
          {(['monthly', 'annual'] as Interval[]).map(i => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: interval === i ? 'var(--accent)' : 'transparent',
                color: interval === i ? 'var(--accent-fg)' : 'var(--text-3)',
              }}
            >
              {i === 'monthly' ? 'Monthly' : 'Annual'}
              {i === 'annual' && (
                <span style={{
                  fontSize: 10, fontWeight: 800, color: interval === 'annual' ? 'var(--accent-fg)' : '#4ade80',
                  background: interval === 'annual' ? 'rgba(0,0,0,0.15)' : 'rgba(74,222,128,0.12)',
                  padding: '2px 6px', borderRadius: 999,
                }}>
                  Save up to 21%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {TIERS.map(t => {
          const isCurrent = t.tier === currentTier
          const hasAnnual = interval === 'annual' && !!t.annualPrice
          const displayPrice = t.tier === 'free' ? 0 : hasAnnual ? (t.annualPrice! / 12) : t.monthlyPrice
          const planId = interval === 'annual' && t.annualPlanId ? t.annualPlanId : t.monthlyPlanId
          const savePct = t.monthlyPrice && t.annualPrice ? Math.round((1 - (t.annualPrice / 12) / t.monthlyPrice) * 100) : null

          return (
            <div key={t.tier} style={{
              position: 'relative',
              background: t.highlight === 'premium'
                ? 'linear-gradient(160deg, rgba(180,255,77,0.10), var(--surface-1) 55%)'
                : 'var(--surface-1)',
              border: `1px solid ${t.highlight === 'premium' ? 'var(--accent)' : isCurrent ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 16, padding: '22px 20px', display: 'flex', flexDirection: 'column',
            }}>
              {t.highlight === 'popular' && (
                <span style={{
                  position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--accent-fg)',
                  background: 'var(--accent)', padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap',
                }}>
                  MOST POPULAR
                </span>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
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

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '10px 0 2px' }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-1)' }}>
                  ${displayPrice === 0 ? '0' : displayPrice!.toFixed(2)}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>/mo</span>
              </div>
              {hasAnnual ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>billed ${t.annualPrice!.toFixed(2)}/yr</span>
                  {savePct && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#4ade80', background: 'rgba(74,222,128,0.12)', padding: '1px 6px', borderRadius: 999 }}>
                      Save {savePct}%
                    </span>
                  )}
                </div>
              ) : interval === 'annual' && t.tier !== 'free' && !t.annualPrice ? (
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>No annual plan — billed monthly</p>
              ) : (
                <div style={{ marginBottom: 8 }} />
              )}

              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.4 }}>{t.tagline}</p>

              {planId && !isCurrent && (
                <PricingCheckoutButton planId={planId} label={`Get ${t.label}`} loggedIn={loggedIn} highlight={t.highlight === 'premium' || t.highlight === 'popular'} />
              )}
              {t.tier === 'free' && !isCurrent && (
                loggedIn ? (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '10px 0' }}>Your current plan</p>
                ) : (
                  <a href="/auth/register" style={{
                    display: 'block', textAlign: 'center', width: '100%', fontSize: 13, fontWeight: 700,
                    color: 'var(--text-1)', background: 'var(--surface-2)', border: '1px solid var(--border)',
                    padding: '10px 16px', borderRadius: 10, textDecoration: 'none',
                  }}>
                    Sign Up Free
                  </a>
                )
              )}

              <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 8px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {t.tier === 'free' && FREE_ROWS.map(f => (
                  <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--text-2)' }}>
                    <Check size={14} color="var(--accent)" style={{ marginTop: 1, flexShrink: 0 }} />
                    <span>{f}</span>
                  </li>
                ))}
                {FEATURE_ROWS.map(row => {
                  const included = TIER_RANK[t.tier] >= TIER_RANK[row.minTier]
                  return (
                    <li key={row.label} style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5,
                      color: included ? 'var(--text-2)' : 'var(--text-3)', opacity: included ? 1 : 0.6,
                    }}>
                      {included
                        ? <Check size={14} color="var(--accent)" style={{ marginTop: 1, flexShrink: 0 }} />
                        : <X size={14} color="var(--text-3)" style={{ marginTop: 1, flexShrink: 0 }} />}
                      <span>{row.label}</span>
                    </li>
                  )
                })}
              </ul>

              {t.tier !== 'free' && (
                <div style={{
                  marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-3)',
                }}>
                  <span>↻ Renews {hasAnnual ? 'annually' : 'monthly'}</span>
                  <span>⊘ Cancel anytime</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
