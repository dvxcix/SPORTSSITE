'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { WHOP_PLANS, TIER_LABEL, type Tier } from '@/lib/tiers'
import { AdminUserActions } from './AdminUserActions'
import { AdminUserSupportActions } from './AdminUserSupportActions'

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  'payment.failed': 'Payment failed',
  'membership.deactivated': 'Deactivated',
  'membership.went_invalid': 'Cancelled',
}

function fmtDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

export function AdminUserRow({ user: u, displayTier, subLabel, emailVerified }: {
  user: any
  displayTier: Tier
  subLabel: string | null
  emailVerified: boolean
}) {
  const [open, setOpen] = useState(false)
  const plan = u.whop_plan_id ? WHOP_PLANS[u.whop_plan_id] : null
  // Real support-relevant subscription info only exists once there's an
  // actual Whop membership behind the tier — a Discord-claim-only or
  // admin-granted account has nothing here to show beyond what the Tier
  // column's sublabel already says.
  const hasSubscription = !!u.whop_plan_id

  return (
    <>
      <tr className="hover:bg-zinc-800/40 transition-colors">
        <td className="px-4 py-3">
          <button onClick={() => setOpen(v => !v)} className="flex items-center gap-3 text-left" aria-label="Toggle details">
            {open ? <ChevronDown size={14} className="text-zinc-500 shrink-0" /> : <ChevronRight size={14} className="text-zinc-500 shrink-0" />}
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-black text-white overflow-hidden shrink-0">
              {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-medium text-white">{u.display_name || u.username}</p>
                {u.is_verified && <span className="text-green-400 text-xs">✓</span>}
              </div>
              <p className="text-xs text-zinc-500">{u.email}</p>
            </div>
          </button>
        </td>
        <td className="px-4 py-3">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            u.account_type === 'admin' ? 'bg-red-500/10 text-red-400' :
            u.account_type === 'creator' ? 'bg-yellow-500/10 text-yellow-400' :
            'bg-zinc-800 text-zinc-400'
          }`}>{u.account_type.toUpperCase()}</span>
        </td>
        <td className="px-4 py-3">
          <p className="text-white font-medium">{TIER_LABEL[displayTier]}</p>
          {subLabel && <p className="text-[10px] text-zinc-500">{subLabel}</p>}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            <ConnectionDot label="X" connected={!!u.verified_identities?.x} />
            <ConnectionDot label="DC" connected={!!u.verified_identities?.discord} />
            <ConnectionDot label="WH" connected={!!u.whop_user_id} />
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs font-bold ${emailVerified ? 'text-green-400' : 'text-red-400'}`}>
            {emailVerified ? '✓' : '✗'}
          </span>
        </td>
        <td className="px-4 py-3 text-zinc-400">{u.follower_count ?? 0}</td>
        <td className="px-4 py-3 text-xs text-zinc-500">{new Date(u.created_at).toLocaleDateString()}</td>
        <td className="px-4 py-3">
          <AdminUserActions
            userId={u.id}
            currentType={u.account_type}
            isVerified={u.is_verified}
            adminGrantedTier={u.admin_granted_tier}
          />
        </td>
      </tr>
      {open && (
        <tr className="bg-zinc-950/60">
          <td colSpan={8} className="px-4 py-4">
            <div className="mb-4 pb-4 border-b border-zinc-800">
              <AdminUserSupportActions userId={u.id} emailVerified={emailVerified} />
            </div>
            {!hasSubscription && !u.admin_granted_tier && !u.discord_advanced_claimed && u.account_type !== 'admin' && !u.beta_access_active ? (
              <p className="text-xs text-zinc-500">No subscription or grant on this account — Free tier by default.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <p className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-1">Plan</p>
                  <p className="text-white">{plan?.label ?? (hasSubscription ? u.whop_plan_id : '—')}</p>
                </div>
                <div>
                  <p className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-1">Status</p>
                  <p className="text-white">{u.tier_status ? (STATUS_LABEL[u.tier_status] ?? u.tier_status) : '—'}</p>
                </div>
                <div>
                  <p className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-1">Purchased</p>
                  <p className="text-white">{fmtDate(u.tier_purchased_at)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-1">Renews</p>
                  <p className="text-white">{fmtDate(u.tier_current_period_end)}</p>
                </div>
                {u.whop_membership_id && (
                  <div className="col-span-2">
                    <p className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-1">Whop Membership ID</p>
                    <p className="text-white font-mono">{u.whop_membership_id}</p>
                  </div>
                )}
                {u.admin_granted_tier && (
                  <div className="col-span-2">
                    <p className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-1">Admin Grant</p>
                    <p className="text-white">{TIER_LABEL[u.admin_granted_tier as Tier]} — granted {fmtDate(u.admin_granted_tier_at)}</p>
                  </div>
                )}
                {u.discord_advanced_claimed && (
                  <div>
                    <p className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-1">Discord Claim</p>
                    <p className="text-white">Advanced included free</p>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function ConnectionDot({ label, connected }: { label: string; connected: boolean }) {
  return (
    <span
      title={connected ? `${label} connected` : `${label} not connected`}
      className={`inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-black ${
        connected ? 'bg-green-500/15 text-green-400' : 'bg-zinc-800 text-zinc-600'
      }`}
    >
      {label}
    </span>
  )
}
