'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion } from 'motion/react'
import { Check, X } from 'lucide-react'
import type { Tier } from '@/lib/tiers'
import { PricingCheckoutButton } from './PricingCheckoutButton'
import { Spotlight } from '@/components/ui/spotlight'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { CometCard } from '@/components/ui/comet-card'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Meteors' per-mount randomized delays differ between server and client
// render — same hydration-mismatch fix as every other marketing/auth page
// in this app (login, register, onboarding, the main LandingPage).
const Meteors = dynamic(() => import('@/components/ui/meteors').then(m => m.Meteors), { ssr: false })

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
  // Configured on the Whop plan itself, not tracked anywhere in our own DB
  // — these two numbers just mirror what's actually set up there. Monthly
  // only (confirmed): the annual plans for both tiers have no trial.
  trialDaysMonthly?: number
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
    monthlyPrice: 24.99, annualPrice: 249.99, highlight: 'popular', trialDaysMonthly: 7,
  },
  {
    tier: 'ultimate', label: 'Ultimate', tagline: 'Every tool, every edge — for serious bettors only.',
    monthlyPlanId: 'plan_tCrVAX62uKyEq', annualPlanId: 'plan_1eWRTXv0XXTrI',
    monthlyPrice: 34.99, annualPrice: 329.99, highlight: 'premium', trialDaysMonthly: 3,
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
  { label: 'The Dugout — our proprietary Game Matrix', minTier: 'ultimate' },
  { label: 'Line Movement Tracker', minTier: 'ultimate' },
]
const FREE_ROWS = ['Browse the community feed', 'View & manage your profile']

export function PricingClient({ loggedIn, currentTier, rawTier = 'free', discordAdvancedClaimed = false, adminGrantedTier = null, fullAccessReason = null, checkoutStatus }: {
  loggedIn: boolean
  currentTier: Tier
  // The real purchased tier (before the free Discord-Advanced floor is
  // folded in) plus the claim flag itself — needed to tell "you'd have to
  // cancel a real Whop subscription to leave this tier" apart from "this
  // tier is just included free via Discord, there's nothing to cancel."
  // Optional/defaulted so any other caller of this component doesn't need
  // to know about the distinction.
  rawTier?: Tier
  discordAdvancedClaimed?: boolean
  // Same reasoning as discordAdvancedClaimed — a tier granted manually from
  // /admin/users is also not a real Whop subscription, so it gets the same
  // "nothing to cancel" treatment instead of the dead-end cancel link.
  adminGrantedTier?: Tier | null
  // Admin/beta accounts bypass every tier gate outright — set, every card's
  // buy/cancel/claim CTA is suppressed in favor of one banner, instead of
  // showing a purchased-looking "Advanced — Current" or inviting a pointless
  // real purchase on top of access they already have.
  fullAccessReason?: 'admin' | 'beta' | null
  checkoutStatus: string | null
}) {
  const [interval, setInterval] = useState<Interval>('monthly')
  const fullAccess = !!fullAccessReason

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {checkoutStatus === 'success' && (
        <div style={{
          position: 'relative', zIndex: 2, textAlign: 'center', fontSize: 13, fontWeight: 600,
          color: '#4ade80', background: 'rgba(74,222,128,0.1)', borderBottom: '1px solid rgba(74,222,128,0.25)',
          padding: '10px 16px',
        }}>
          Payment received — your plan updates automatically within a few seconds. If it doesn't show yet, refresh the page.
        </div>
      )}
      {checkoutStatus === 'error' && (
        <div style={{
          position: 'relative', zIndex: 2, textAlign: 'center', fontSize: 13, fontWeight: 600,
          color: '#f87171', background: 'rgba(248,113,113,0.1)', borderBottom: '1px solid rgba(248,113,113,0.25)',
          padding: '10px 16px',
        }}>
          Checkout didn't complete. No charge was made — try again whenever you're ready.
        </div>
      )}
      {/* Hero — same treatment as the main LandingPage: Spotlight + BackgroundBeams + Meteors */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)',
          width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(180,255,77,0.09) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <Spotlight className="left-0 top-0" fill="#B4FF4D" />
        <BackgroundBeams className="opacity-30" />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <Meteors number={16} className="opacity-50" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          style={{ position: 'relative', maxWidth: 620, margin: '0 auto', padding: '64px 24px 8px', textAlign: 'center', zIndex: 1 }}
        >
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, color: 'var(--text-1)', marginBottom: 12, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            Bet smarter, not <span style={{ color: 'var(--accent)' }}>harder.</span>
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
            Free tools to get started. Upgrade for live analytics, line movement, and the deepest breakdown on the slate.
            Try Advanced free for 7 days or Ultimate free for 3 — monthly plans only.
          </p>
        </motion.div>
      </div>

      <div style={{ position: 'relative', maxWidth: 1120, margin: '0 auto', padding: '20px 20px 64px', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 18px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: interval === 'monthly' ? 'var(--text-1)' : 'var(--text-3)' }}>Monthly</span>
            <Switch checked={interval === 'annual'} onChange={v => setInterval(v ? 'annual' : 'monthly')} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: interval === 'annual' ? 'var(--text-1)' : 'var(--text-3)' }}>
              Annual
              <Badge variant="save">Save up to 21%</Badge>
            </span>
          </div>
        </div>

        {fullAccess && (
          <div style={{
            textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--accent)',
            background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 10,
            padding: '10px 16px', marginBottom: 24,
          }}>
            {fullAccessReason === 'admin' ? 'Admin account — full access to every tier.' : 'Beta access — full access to every tier while the beta program is active.'}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {TIERS.map(t => {
            const isCurrent = t.tier === currentTier
            const cardRank = TIER_RANK[t.tier]
            const realRank = TIER_RANK[rawTier]
            // Whop is the billing system of record — a "downgrade" here can
            // only ever be a cancellation over there (which then reverts the
            // account to Free via the webhook), never a second purchase
            // stacked under an existing one. So a tier below what someone
            // already has doesn't get a buy button — that would just create
            // a separate, redundant Whop membership rather than actually
            // switching them down.
            const isDowngrade = loggedIn && cardRank < TIER_RANK[currentTier]
            // A card at or below the free Discord-Advanced floor, but above
            // what was actually purchased, has nothing behind it to cancel —
            // sending someone there to /settings/membership's "Manage on
            // Whop" link would be a dead end (confirmed live: an account
            // with Advanced only via the Discord claim saw no cancel/manage
            // option there, because there's no real subscription to manage).
            // "Cancel to Downgrade" only makes sense when the card is below
            // what was actually bought.
            const isClaimCovered = loggedIn && discordAdvancedClaimed && cardRank > realRank && cardRank <= TIER_RANK.advanced
            // Same reasoning, for a manual /admin/users grant instead of the
            // Discord claim — capped at whatever tier was actually granted,
            // not always Advanced.
            const adminGrantRank = adminGrantedTier ? TIER_RANK[adminGrantedTier] : -1
            const isGrantCovered = loggedIn && adminGrantedTier != null && cardRank > realRank && cardRank <= adminGrantRank
            const coverageNote = isGrantCovered ? 'Granted by admin' : isClaimCovered ? 'Included free via Discord' : null
            // Based on what was actually bought (realRank), not the
            // claim/grant-inflated floor — someone who's never paid for
            // anything has no real subscription to cancel just because the
            // floor sits above this card.
            const isRealDowngrade = loggedIn && cardRank < realRank
            const isRealCurrent = isCurrent && !isClaimCovered && !isGrantCovered
            const hasAnnual = interval === 'annual' && !!t.annualPrice
            const displayPrice = t.tier === 'free' ? 0 : hasAnnual ? (t.annualPrice! / 12) : t.monthlyPrice
            const planId = interval === 'annual' && t.annualPlanId ? t.annualPlanId : t.monthlyPlanId
            const savePct = t.monthlyPrice && t.annualPrice ? Math.round((1 - (t.annualPrice / 12) / t.monthlyPrice) * 100) : null

            return (
              <CometCard key={t.tier} className="w-full">
                <div style={{
                  background: t.highlight === 'premium'
                    ? 'linear-gradient(160deg, rgba(180,255,77,0.10), var(--surface-1) 55%)'
                    : 'var(--surface-1)',
                  border: `1px solid ${t.highlight === 'premium' || (isCurrent && !fullAccess) ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 16, padding: '22px 20px', display: 'flex', flexDirection: 'column', height: '100%',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>{t.label}</h2>
                      {t.highlight === 'popular' && <Badge variant="popular">Most Popular</Badge>}
                    </div>
                    {isCurrent && !fullAccess && <Badge variant="upcoming">Current</Badge>}
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
                      {savePct && <Badge variant="save">Save {savePct}%</Badge>}
                    </div>
                  ) : interval === 'annual' && t.tier !== 'free' && !t.annualPrice ? (
                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>No annual plan — billed monthly</p>
                  ) : (
                    <div style={{ marginBottom: 8 }} />
                  )}

                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.4 }}>{t.tagline}</p>

                  {/* Monthly-only (confirmed against the actual Whop plan
                      config) — switching to Annual drops this, since that
                      plan has no trial behind it. */}
                  {interval === 'monthly' && t.trialDaysMonthly && (
                    <div style={{ marginBottom: 14, marginTop: -6 }}>
                      <Badge variant="save">{t.trialDaysMonthly}-day free trial</Badge>
                    </div>
                  )}

                  {!fullAccess && planId && !isCurrent && !isDowngrade && (
                    <PricingCheckoutButton
                      planId={planId}
                      label={interval === 'monthly' && t.trialDaysMonthly ? `Start ${t.trialDaysMonthly}-Day Trial` : `Get ${t.label}`}
                      loggedIn={loggedIn}
                      highlight={t.highlight === 'premium' || t.highlight === 'popular'}
                    />
                  )}
                  {/* Covered by the free Discord-Advanced claim or a manual
                      admin grant, not an actual purchase — nothing to cancel
                      or manage on Whop for this card, so no button, just the
                      same explanation /settings/membership itself gives.
                      Suppressed for full-access accounts too — the page
                      banner above already covers it, and this card's cause
                      may not even be the claim/grant (e.g. an admin who also
                      happens to hold one). */}
                  {!fullAccess && coverageNote && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', padding: '9px 0' }}>
                      {coverageNote}
                    </p>
                  )}
                  {/* Downgrading (including all the way back to Free) only
                      happens by cancelling the current plan on Whop — send
                      them to Membership settings, which has the real
                      "Manage on Whop" link, instead of a buy button that
                      would just stack a second plan on top. */}
                  {!fullAccess && isRealDowngrade && (
                    <Link href="/settings/membership" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
                      Cancel to Downgrade
                    </Link>
                  )}
                  {/* Same reasoning for the plan you're already on — cancelling
                      is also a Whop action, not something this page can do
                      directly. */}
                  {!fullAccess && isRealCurrent && t.tier !== 'free' && (
                    <Link href="/settings/membership" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
                      Manage / Cancel
                    </Link>
                  )}
                  {/* Free's own CTA only matters for a logged-out visitor — a
                      logged-in user is either already on Free (the "Current"
                      badge above already says so) or on a paid tier (handled
                      by the downgrade case above), so no button/label renders
                      in either logged-in case. */}
                  {t.tier === 'free' && !loggedIn && (
                    <a href="/auth/register" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
                      Sign Up Free
                    </a>
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
              </CometCard>
            )
          })}
        </div>
      </div>
    </div>
  )
}
