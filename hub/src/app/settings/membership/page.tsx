import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { WHOP_PLANS, effectiveTier, hasTierAccess, type Tier } from '@/lib/tiers'
import { PricingCheckoutButton } from '@/app/pricing/PricingCheckoutButton'
import { CheckCircle2, XCircle } from 'lucide-react'

const TIER_LABEL: Record<Tier, string> = { free: 'Free', basic: 'Basic', advanced: 'Advanced', ultimate: 'Ultimate' }
const DISCORD_ADDON_PLAN_ID = 'plan_Q1Ey6RMgjS9XQ'

export default async function MembershipSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/membership')

  const { data: profile } = await supabase
    .from('users')
    .select('tier, tier_status, tier_current_period_end, whop_plan_id, beta_access_active, account_type, discord_advanced_claimed')
    .eq('id', user.id)
    .single()

  const rawTier = (profile?.tier as Tier) ?? 'free'
  const tier = effectiveTier(rawTier, profile?.discord_advanced_claimed)
  const includedViaDiscord = !!profile?.discord_advanced_claimed && !hasTierAccess(rawTier, 'advanced')
  const plan = profile?.whop_plan_id ? WHOP_PLANS[profile.whop_plan_id] : null
  const isPaid = rawTier !== 'free'
  const isActive = profile?.tier_status === 'active'
  const renewalDate = profile?.tier_current_period_end
    ? new Date(profile.tier_current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null
  // The $10 add-on only makes sense on top of the free Discord-included
  // Advanced — someone who already bought Ultimate outright has no use for
  // it, and someone without the claim at all can't use it either (it's not
  // sold standalone on /pricing).
  const showDiscordAddon = !!profile?.discord_advanced_claimed && !hasTierAccess(tier, 'ultimate')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Membership</h1>

      {(profile?.account_type === 'admin' || profile?.beta_access_active) && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-sm text-green-400 mb-4">
          {profile?.account_type === 'admin' ? 'Admin account — full access to every tier.' : 'Beta access — full access to every tier while the beta program is active.'}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Current Plan</p>
          {isPaid && (
            <span className={`flex items-center gap-1 text-xs font-bold ${isActive ? 'text-green-400' : 'text-red-400'}`}>
              {isActive ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {isActive ? 'Active' : profile?.tier_status || 'Inactive'}
            </span>
          )}
        </div>
        <p className="text-2xl font-black text-white mb-1">{TIER_LABEL[tier]}</p>
        {includedViaDiscord
          ? <p className="text-sm text-zinc-500">Included free with your Discord membership.</p>
          : plan && <p className="text-sm text-zinc-500">{plan.label}{renewalDate ? ` — renews ${renewalDate}` : ''}</p>}
        {!isPaid && !includedViaDiscord && <p className="text-sm text-zinc-500">Free forever — upgrade any time for the research tools.</p>}

        <div className="mt-4 flex gap-2">
          <Link href="/pricing" className="bg-green-500 hover:bg-green-400 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
            {isPaid ? 'Change Plan' : 'Upgrade'}
          </Link>
        </div>
      </div>

      {showDiscordAddon && (
        <div className="bg-zinc-900 border border-green-500/20 rounded-xl p-5 mb-4">
          <h3 className="font-bold text-white mb-1">Add Ultimate — $10/mo</h3>
          <p className="text-xs text-zinc-500 mb-3">
            You already get Advanced free through your Discord membership — add every Ultimate tool (including The Dugout) for just $10/mo on top, instead of the full price. This stays active only as long as your Discord membership does.
          </p>
          <PricingCheckoutButton planId={DISCORD_ADDON_PLAN_ID} label="Add Ultimate — $10/mo" loggedIn />
        </div>
      )}

      {isPaid && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="font-bold text-white mb-2">Manage or Cancel</h3>
          <p className="text-xs text-zinc-500 mb-3">
            Billing is handled by Whop, not SlipSurge directly — sign in to your Whop account to update payment info or cancel your subscription anytime.
          </p>
          <a href="https://whop.com" target="_blank" rel="noopener noreferrer"
            className="inline-block border border-zinc-700 text-white hover:bg-zinc-800 font-bold px-4 py-2 rounded-xl text-sm transition-colors">
            Manage on Whop
          </a>
        </div>
      )}
    </div>
  )
}
