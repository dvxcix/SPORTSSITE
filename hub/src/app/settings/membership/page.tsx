import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { WHOP_PLANS, effectiveTier, hasTierAccess, type Tier } from '@slipsurge/core/tiers'
import { PricingCheckoutButton } from '@/app/pricing/PricingCheckoutButton'
import { CancelMembershipButton } from './CancelMembershipButton'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'
import { SettingsShell } from '@/components/settings/SettingsShell'
import { createAdminClient } from '@/lib/supabase/admin'
import styles from './MembershipSettings.module.css'

const TIER_LABEL: Record<Tier, string> = { free: 'Free', basic: 'Basic', advanced: 'Advanced', ultimate: 'Ultimate' }
const DISCORD_ADDON_PLAN_ID = 'plan_Q1Ey6RMgjS9XQ'

const LINK_ERROR_LABEL: Record<string, string> = {
  already_linked_elsewhere: 'That Whop account is already connected to a different SlipSurge account.',
  link_failed: 'Could not connect your Whop account — please try again.',
  whop_auth_failed: 'Whop sign-in failed — please try again.',
}

export default async function MembershipSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ whop_linked?: string; whop_link_error?: string }>
}) {
  const { whop_linked, whop_link_error } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/membership')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('tier, tier_status, tier_current_period_end, whop_plan_id, whop_membership_id, tier_cancel_at_period_end, beta_access_active, account_type, discord_advanced_claimed, admin_granted_tier, whop_user_id')
    .eq('id', user.id)
    .single()

  const rawTier = (profile?.tier as Tier) ?? 'free'
  const adminGrantedTier = (profile?.admin_granted_tier as Tier | null) ?? null
  const tier = effectiveTier(rawTier, profile?.discord_advanced_claimed, adminGrantedTier)
  const includedViaDiscord = !!profile?.discord_advanced_claimed && !hasTierAccess(rawTier, 'advanced')
  // A manual grant raises the floor the same way the Discord claim does —
  // "included" here just means "not the raw purchased tier," same test as
  // includedViaDiscord but checked against whatever tier was actually
  // granted instead of always Advanced.
  const includedViaGrant = !!adminGrantedTier && !hasTierAccess(rawTier, adminGrantedTier)
  const plan = profile?.whop_plan_id ? WHOP_PLANS[profile.whop_plan_id] : null
  const isPaid = rawTier !== 'free'
  const isActive = profile?.tier_status === 'active'
  const renewalDate = profile?.tier_current_period_end
    ? new Date(profile.tier_current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null
  // Admin/beta full access already bypasses every tier gate regardless of
  // what's actually purchased or claimed — showing "Advanced" here (because
  // that's all the real tier + Discord claim add up to) undersold what the
  // account can actually do. Display-only: doesn't touch tier/rawTier, which
  // stay the real billing state everywhere else on this page.
  const fullAccess = profile?.account_type === 'admin' || !!profile?.beta_access_active
  const displayTier: Tier = fullAccess ? 'ultimate' : tier
  // The $10 add-on only makes sense on top of the free Discord-included
  // Advanced — someone who already bought Ultimate outright has no use for
  // it, someone without the claim at all can't use it either (it's not sold
  // standalone on /pricing), and a full-access account already has Ultimate
  // regardless of any purchase.
  const showDiscordAddon = !fullAccess && !!profile?.discord_advanced_claimed && !hasTierAccess(tier, 'ultimate')

  return (
    <SettingsShell active="/settings/membership" eyebrow="PLAN AND BILLING" title="Your SlipSurge membership" description="Review access, renewal details, connected billing, and available plan options.">

      {whop_linked && (
        <div className={styles.notice}>
          Whop connected{profile?.discord_advanced_claimed ? ' — your free Advanced tier is now active.' : '.'}
        </div>
      )}
      {whop_link_error && (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          {LINK_ERROR_LABEL[whop_link_error] || 'Could not connect your Whop account — please try again.'}
        </div>
      )}

      {!profile?.whop_user_id && (
        <div className={styles.card}>
          <h3>Connect Whop</h3>
          <p>
            If you signed up with X or Discord, connecting your Whop account here checks it for a free Advanced tier through our Discord membership — you don't need to sign in with Whop again, just link it once.
          </p>
          <a href="/auth/whop/login?mode=link&next=/settings/membership"
            className={styles.secondary}>
            Connect Whop
          </a>
        </div>
      )}

      {(profile?.account_type === 'admin' || profile?.beta_access_active) && (
        <div className={styles.notice}>
          {profile?.account_type === 'admin' ? 'Admin account — full access to every tier.' : 'Beta access — full access to every tier while the beta program is active.'}
        </div>
      )}

      <div className={`${styles.card} ${styles.cardAccent}`}>
        <div className={styles.planHead}>
          <p className={styles.eyebrow}>Current Plan</p>
          {isPaid && (
            <span className={`${styles.status} ${profile?.tier_cancel_at_period_end ? styles.statusWarn : isActive ? '' : styles.statusError}`}>
              {profile?.tier_cancel_at_period_end ? <Clock size={13} /> : isActive ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {profile?.tier_cancel_at_period_end ? 'Cancels at period end' : isActive ? 'Active' : profile?.tier_status || 'Inactive'}
            </span>
          )}
        </div>
        <p className={styles.planName}>{TIER_LABEL[displayTier]}</p>
        {fullAccess
          ? <p>{profile?.account_type === 'admin' ? 'Full access as an admin account.' : 'Full access during the beta program.'}</p>
          : includedViaGrant
            ? <p>Granted by an admin.</p>
            : includedViaDiscord
              ? <p>Included free with your Discord membership.</p>
              : plan && <p>{plan.label}{renewalDate ? ` — renews ${renewalDate}` : ''}</p>}
        {!isPaid && !includedViaDiscord && !includedViaGrant && !fullAccess && <p>Free forever — upgrade any time for the research tools.</p>}

        {!fullAccess && (
          <div className={styles.actions}>
            <Link href="/pricing" className={styles.primary}>
              {isPaid ? 'Change Plan' : 'Upgrade'}
            </Link>
          </div>
        )}
      </div>

      {showDiscordAddon && (
        <div className={`${styles.card} ${styles.cardAccent}`}>
          <h3>Add Ultimate — $10/mo</h3>
          <p>
            You already get Advanced free through your Discord membership — add every Ultimate tool (including The Dugout) for just $10/mo on top, instead of the full price. This stays active only as long as your Discord membership does.
          </p>
          <PricingCheckoutButton planId={DISCORD_ADDON_PLAN_ID} label="Add Ultimate — $10/mo" loggedIn />
        </div>
      )}

      {isPaid && (
        <div className={styles.card}>
          <h3>Manage or Cancel</h3>
          {profile?.tier_cancel_at_period_end ? (
            <p>
              Your subscription is set to cancel{renewalDate ? ` — you'll keep access until ${renewalDate}, then your account moves to Free` : ''}.
            </p>
          ) : profile?.whop_membership_id ? (
            <>
              <p>
                Cancel any time — you'll keep your current tier until the end of the billing period, then your account moves to Free.
              </p>
              <CancelMembershipButton renewalDate={renewalDate} />
            </>
          ) : (
            <>
              <p>
                Billing is handled by Whop, not SlipSurge directly — sign in to your Whop account to update payment info or cancel your subscription anytime.
              </p>
              <a href="https://whop.com" target="_blank" rel="noopener noreferrer"
                className={styles.secondary}>
                Manage on Whop
              </a>
            </>
          )}
        </div>
      )}
    </SettingsShell>
  )
}
