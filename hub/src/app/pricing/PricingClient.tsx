'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion } from 'motion/react'
import { Check, X, ShieldCheck } from 'lucide-react'
import type { Tier } from '@slipsurge/core/tiers'
import { PricingCheckoutButton } from './PricingCheckoutButton'
import { Spotlight } from '@/components/ui/spotlight'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { CometCard } from '@/components/ui/comet-card'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import styles from './PricingClient.module.css'

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
  highlight?: 'premium'
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
    monthlyPrice: 24.99, annualPrice: 249.99, trialDaysMonthly: 7,
  },
  {
    tier: 'ultimate', label: 'Ultimate', tagline: 'Every research tool for members who want the complete workspace.',
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
  { label: 'Community access: posts, DMs, groups, channels, and notifications', minTier: 'basic' },
  { label: 'Community leaderboard', minTier: 'free' },
  { label: 'Player research & search', minTier: 'basic' },
  { label: 'Live scores & play-by-play', minTier: 'basic' },
  { label: 'Pitcher Report + Weather Lab', minTier: 'basic' },
  { label: 'Full Slate Breakdown', minTier: 'advanced' },
  { label: 'The Dugout, our proprietary Game Matrix', minTier: 'ultimate' },
  { label: 'The Public', minTier: 'advanced' },
  { label: 'Line Movement Tracker', minTier: 'ultimate' },
]
const FREE_ROWS = ['Browse the community feed', 'View & manage your profile']

const PLAN_GUIDE = [
  { href: '#plan-basic', label: 'Start with Basic', detail: 'Community, live scores, and core MLB research' },
  { href: '#plan-advanced', label: 'Choose Advanced', detail: 'Add full-slate analysis and public market context' },
  { href: '#plan-ultimate', label: 'Go Ultimate', detail: 'Unlock The Dugout, Odds Terminal, and every tool' },
]

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
    <div className={styles.page}>
      {checkoutStatus === 'success' && (
        <div className={`${styles.statusBanner} ${styles.statusSuccess}`}>
          Payment received. Your plan updates automatically within a few seconds. If it doesn&apos;t show yet, refresh the page.
        </div>
      )}
      {checkoutStatus === 'error' && (
        <div className={`${styles.statusBanner} ${styles.statusError}`}>
          Checkout didn&apos;t complete. No charge was made. Try again whenever you&apos;re ready.
        </div>
      )}
      {/* Hero — same treatment as the main LandingPage: Spotlight + BackgroundBeams + Meteors */}
      <div className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <Spotlight className="left-0 top-0" fill="#B4FF4D" />
        <BackgroundBeams className="opacity-30" />
        <div className={styles.heroMeteors} aria-hidden="true">
          <Meteors number={16} className="opacity-50" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className={styles.heroContent}
        >
          <div className={styles.eyebrow}>SlipSurge memberships</div>
          <h1 className={styles.heroTitle}>
            Start free. Upgrade when you need <span>more signal.</span>
          </h1>
          <p className={styles.heroCopy}>
            Free tools to get started. Upgrade for live analytics, line movement, and the deepest breakdown on the slate.
            Monthly Advanced includes a 7-day trial. Monthly Ultimate includes a 3-day trial.
          </p>
        </motion.div>
      </div>

      <div className={styles.main}>
        <nav className={styles.planGuide} aria-label="Choose a membership by goal">
          {PLAN_GUIDE.map(item => (
            <a key={item.href} href={item.href}>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </a>
          ))}
        </nav>

        <div className={styles.billingTrust}><ShieldCheck size={14} /> Secure membership management and billing powered by Whop</div>

        <div className={styles.intervalWrap}>
          <div className={styles.intervalControl}>
            <span className={interval === 'monthly' ? styles.intervalActive : undefined}>Monthly</span>
            <Switch checked={interval === 'annual'} onChange={v => setInterval(v ? 'annual' : 'monthly')} ariaLabel="Use annual billing" />
            <span className={interval === 'annual' ? styles.intervalActive : undefined}>
              Annual
              <Badge variant="save">Save up to 21%</Badge>
            </span>
          </div>
        </div>

        {fullAccess && (
          <div className={styles.accessBanner}>
            {fullAccessReason === 'admin' ? 'Admin account — full access to every tier.' : 'Beta access — full access to every tier while the beta program is active.'}
          </div>
        )}

        <div className={styles.cards}>
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
              <div key={t.tier} id={`plan-${t.tier}`} className={styles.cardAnchor}>
              <CometCard className="w-full h-full">
                <div className={`${styles.card} ${t.highlight === 'premium' ? styles.cardPremium : ''} ${isCurrent && !fullAccess ? styles.cardCurrent : ''}`}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardName}>
                      <h2>{t.label}</h2>
                      {t.highlight === 'premium' && <Badge variant="popular">Most Popular</Badge>}
                    </div>
                    {isCurrent && !fullAccess && <Badge variant="upcoming">Current</Badge>}
                  </div>

                  <div className={styles.price}>
                    <span>
                      ${displayPrice === 0 ? '0' : displayPrice!.toFixed(2)}
                    </span>
                    <small>/mo</small>
                  </div>
                  {hasAnnual ? (
                    <div className={styles.billingDetail}>
                      <span>billed ${t.annualPrice!.toFixed(2)}/yr</span>
                      {savePct && <Badge variant="save">Save {savePct}%</Badge>}
                    </div>
                  ) : interval === 'annual' && t.tier !== 'free' && !t.annualPrice ? (
                    <p className={styles.billingDetail}>No annual plan. Billed monthly.</p>
                  ) : (
                    <div className={styles.billingSpacer} />
                  )}

                  <p className={styles.tagline}>{t.tagline}</p>

                  {/* Monthly-only (confirmed against the actual Whop plan
                      config) — switching to Annual drops this, since that
                      plan has no trial behind it. */}
                  {interval === 'monthly' && t.trialDaysMonthly && (
                    <div className={styles.trialBadge}>
                      <Badge variant="save">{t.trialDaysMonthly}-day free trial</Badge>
                    </div>
                  )}

                  {!fullAccess && planId && !isCurrent && !isDowngrade && (
                    <PricingCheckoutButton
                      planId={planId}
                      label={interval === 'monthly' && t.trialDaysMonthly ? `Start ${t.trialDaysMonthly}-Day Trial` : `Get ${t.label}`}
                      loggedIn={loggedIn}
                      highlight={t.highlight === 'premium'}
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
                    <p className={styles.coverageNote}>
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

                  <ul className={styles.featureList}>
                    {t.tier === 'free' && FREE_ROWS.map(f => (
                      <li key={f}>
                        <Check size={14} />
                        <span>{f}</span>
                      </li>
                    ))}
                    {FEATURE_ROWS.map(row => {
                      const included = TIER_RANK[t.tier] >= TIER_RANK[row.minTier]
                      return (
                        <li key={row.label} className={included ? '' : styles.featureUnavailable}>
                          {included
                            ? <Check size={14} />
                            : <X size={14} />}
                          <span>{row.label}</span>
                        </li>
                      )
                    })}
                  </ul>

                  {t.tier !== 'free' && (
                    <div className={styles.renewal}>
                      <span>Renews {hasAnnual ? 'annually' : 'monthly'}</span>
                      <span>Cancel anytime</span>
                    </div>
                  )}
                </div>
              </CometCard>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
