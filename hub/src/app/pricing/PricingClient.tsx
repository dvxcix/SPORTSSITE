'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, ShieldCheck, X } from 'lucide-react'
import { ULTIMATE_ANNUAL_CHECKOUT_PLAN_ID, ULTIMATE_CHECKOUT_PLAN_ID, type Tier } from '@slipsurge/core/tiers'
import { PricingCheckoutButton } from './PricingCheckoutButton'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import styles from './PricingClient.module.css'

const FEATURES = [
  { label: 'Browse the NFL & NBA community feed', free: true },
  { label: 'View and manage your profile', free: true },
  { label: 'Choose favorite teams and players', free: true },
  { label: 'Community leaderboard', free: true },
  { label: 'Posts, messages, groups and channels', free: false },
  { label: 'Player research and search', free: false },
  { label: 'NFL & NBA live scores, box scores and play-by-play', free: false },
  { label: 'The Sideline · NFL research', free: false },
  { label: 'The Court · NBA research, odds and ladders', free: false },
]

export function PricingClient({ loggedIn, currentTier, rawTier = 'free', discordAdvancedClaimed = false, fullAccessReason = null, checkoutStatus }: {
  loggedIn: boolean
  currentTier: Tier
  rawTier?: Tier
  discordAdvancedClaimed?: boolean
  adminGrantedTier?: Tier | null
  fullAccessReason?: 'admin' | 'beta' | null
  checkoutStatus: string | null
}) {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')
  const hasUltimate = currentTier === 'ultimate' || fullAccessReason === 'admin'
  // Existing paid plans must be managed before a new purchase to avoid two
  // memberships. Preserve their real billing state until migration is agreed.
  const hasExistingPaidPlan = loggedIn && rawTier !== 'free'
  const eligibleDiscordOffer = loggedIn && discordAdvancedClaimed && !hasUltimate && !hasExistingPaidPlan

  return <div className={styles.page}>
    {(checkoutStatus === 'succeeded' || checkoutStatus === 'success') && <div className={`${styles.statusBanner} ${styles.statusSuccess}`}>Payment received. Your plan updates automatically within a few seconds.</div>}
    {(['failed', 'canceled', 'error'].includes(checkoutStatus ?? '')) && <div className={`${styles.statusBanner} ${styles.statusError}`}>Checkout didn&apos;t complete. Check your payment status before trying again.</div>}
    <div className={styles.hero}><div className={styles.heroContent}>
      <div className={styles.eyebrow}>SlipSurge memberships</div>
      <h1 className={styles.heroTitle}>Free or <span>Ultimate</span></h1>
      <p className={styles.heroCopy}>Follow the community for free, or get NFL and NBA research with Ultimate.</p>
    </div></div>
    <div className={styles.main}>
      <div className={styles.billingTrust}><ShieldCheck size={14} /> Secure membership management and billing powered by Whop</div>
      <div className={styles.intervalWrap}>
        <div className={styles.intervalControl} role="group" aria-label="Billing period">
          <button type="button" aria-pressed={interval === 'monthly'} className={interval === 'monthly' ? styles.intervalActive : undefined} onClick={() => setInterval('monthly')}>Monthly</button>
          <button type="button" aria-pressed={interval === 'annual'} className={interval === 'annual' ? styles.intervalActive : undefined} onClick={() => setInterval('annual')}>Annual</button>
        </div>
      </div>
      {fullAccessReason === 'admin' && <div className={styles.accessBanner}>Admin account — full access</div>}
      {fullAccessReason === 'beta' && <div className={styles.accessBanner}>Beta access is active for included tools. NBA research requires Ultimate.</div>}
      {hasExistingPaidPlan && rawTier !== 'ultimate' && <div className={styles.accessBanner}>Your existing {rawTier === 'basic' ? 'Basic' : 'Advanced'} membership: <Link href="/settings/membership">manage billing</Link></div>}
      <div className={styles.cards}>
        {(['free', 'ultimate'] as const).map(tier => {
          const paid = tier === 'ultimate'
          const current = paid ? hasUltimate : loggedIn && currentTier === 'free' && !fullAccessReason
          return <div key={tier} id={`plan-${tier}`} className={styles.cardAnchor}>
            <div className={`${styles.card} ${paid ? styles.cardPremium : ''} ${current ? styles.cardCurrent : ''}`}>
              <div className={styles.cardHeader}><div className={styles.cardName}><h2>{paid ? 'Ultimate' : 'Free'}</h2></div>{current && <span className={styles.coverageNote}>Current</span>}</div>
              <div className={styles.price}><span>{paid ? (interval === 'annual' ? '$199.99' : '$19.99') : '$0'}</span><small>{paid ? (interval === 'annual' ? '/365 days' : '/30 days') : ''}</small></div>
              {paid && <p className={styles.billingDetail}>{interval === 'annual' ? 'Annual' : 'Monthly'} price for new memberships</p>}
              {paid && interval === 'monthly' && <p className={styles.billingDetail}>3-day free trial, then $19.99 every 30 days</p>}
              <p className={styles.tagline}>{paid ? 'NFL and NBA research, odds and community tools.' : 'Browse the community and manage your profile.'}</p>
              {!paid && !loggedIn && <Link href="/auth/register" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>Sign up free</Link>}
              {paid && hasExistingPaidPlan && <Link href="/settings/membership" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>Manage membership</Link>}
              {paid && eligibleDiscordOffer && <Link href="/settings/membership" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>View Discord member offer</Link>}
              {paid && !hasUltimate && !hasExistingPaidPlan && (!eligibleDiscordOffer || interval === 'annual') && <PricingCheckoutButton planId={interval === 'annual' ? ULTIMATE_ANNUAL_CHECKOUT_PLAN_ID : ULTIMATE_CHECKOUT_PLAN_ID} label={interval === 'annual' ? 'Get Ultimate' : 'Start 3-day free trial'} loggedIn={loggedIn} highlight />}
              <ul className={styles.featureList}>{FEATURES.map(feature => {
                const included = paid || feature.free
                return <li key={feature.label} className={included ? '' : styles.featureUnavailable}>{included ? <Check size={14} /> : <X size={14} />}<span>{feature.label}</span></li>
              })}</ul>
              {paid && <div className={styles.renewal}><span>New memberships renew every {interval === 'annual' ? '365' : '30'} days</span><span>Cancel anytime</span></div>}
            </div>
          </div>
        })}
      </div>
    </div>
  </div>
}
