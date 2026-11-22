'use client'

import Image from 'next/image'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { WHOP_PLANS, TIER_LABEL, type Tier } from '@slipsurge/core/tiers'
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

export interface AdminUserRecord {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  email: string
  account_type: string
  is_verified: boolean
  follower_count: number | null
  created_at: string
  tier: Tier | null
  discord_advanced_claimed: boolean | null
  admin_granted_tier: Exclude<Tier, 'free'> | null
  admin_granted_tier_at: string | null
  beta_access_active: boolean | null
  verified_identities: Record<string, unknown> | null
  whop_user_id: string | null
  whop_plan_id: string | null
  tier_status: string | null
  tier_current_period_end: string | null
  tier_purchased_at: string | null
  whop_membership_id: string | null
}

export function AdminUserRow({ user: u, displayTier, subLabel, emailVerified }: {
  user: AdminUserRecord
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
      <tr className="hover:bg-[color-mix(in_srgb,var(--surface-2)_40%,transparent)] transition-colors">
        <td className="px-4 py-3">
          <button type="button" onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-left" aria-label={`Show details for ${u.display_name || u.username}`} aria-expanded={open}>
            {open ? <ChevronDown size={14} className="text-[var(--text-3)] shrink-0" /> : <ChevronRight size={14} className="text-[var(--text-3)] shrink-0" />}
            <div className="w-8 h-8 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-xs font-semibold text-[var(--text-1)] overflow-hidden shrink-0">
              {u.avatar_url ? <Image unoptimized src={u.avatar_url} alt="" width={32} height={32} className="h-full w-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-medium text-[var(--text-1)]">{u.display_name || u.username}</p>
                {u.is_verified && <span className="text-[var(--green)] text-xs">✓</span>}
              </div>
              <p className="text-xs text-[var(--text-3)]">{u.email}</p>
            </div>
          </button>
        </td>
        <td className="px-4 py-3">
          <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${
            u.account_type === 'admin' ? 'bg-[color-mix(in_srgb,var(--red)_10%,transparent)] text-[var(--red)]' :
            u.account_type === 'creator' ? 'bg-yellow-500/10 text-yellow-400' :
            'bg-[var(--surface-2)] text-[var(--text-2)]'
          }`}>{u.account_type.toUpperCase()}</span>
        </td>
        <td className="px-4 py-3">
          <p className="text-[var(--text-1)] font-medium">{TIER_LABEL[displayTier]}</p>
          {subLabel && <p className="text-[12px] text-[var(--text-3)]">{subLabel}</p>}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            <ConnectionDot label="X" connected={!!u.verified_identities?.x} />
            <ConnectionDot label="DC" connected={!!u.verified_identities?.discord} />
            <ConnectionDot label="WH" connected={!!u.whop_user_id} />
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs font-bold ${emailVerified ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
            {emailVerified ? '✓' : '✗'}
          </span>
        </td>
        <td className="px-4 py-3 text-[var(--text-2)]">{u.follower_count ?? 0}</td>
        <td className="px-4 py-3 text-xs text-[var(--text-3)]">{new Date(u.created_at).toLocaleDateString('en-US', {timeZone:'UTC'})}</td>
        <td className="px-4 py-3">
          <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={`Manage ${u.display_name || u.username}`} className="ss-admin-manage-user">Manage {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        </td>
      </tr>
      {open && (
        <tr className="bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]">
          <td colSpan={8} className="px-4 py-4">
            <div className="ss-admin-user-detail">
            <div className="mb-4 pb-4 border-b border-[var(--border)]">
              <AdminUserActions userId={u.id} currentType={u.account_type} isVerified={u.is_verified} adminGrantedTier={u.admin_granted_tier} />
            </div>
            <div className="mb-4 pb-4 border-b border-[var(--border)]">
              <AdminUserSupportActions userId={u.id} emailVerified={emailVerified} />
            </div>
            {!hasSubscription && !u.admin_granted_tier && !u.discord_advanced_claimed && u.account_type !== 'admin' && !u.beta_access_active ? (
              <p className="text-xs text-[var(--text-3)]">No subscription or grant on this account — Free tier by default.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <p className="text-[var(--text-3)] font-bold uppercase tracking-wider text-[12px] mb-1">Plan</p>
                  <p className="text-[var(--text-1)]">{plan?.label ?? (hasSubscription ? u.whop_plan_id : '—')}</p>
                </div>
                <div>
                  <p className="text-[var(--text-3)] font-bold uppercase tracking-wider text-[12px] mb-1">Status</p>
                  <p className="text-[var(--text-1)]">{u.tier_status ? (STATUS_LABEL[u.tier_status] ?? u.tier_status) : '—'}</p>
                </div>
                <div>
                  <p className="text-[var(--text-3)] font-bold uppercase tracking-wider text-[12px] mb-1">Purchased</p>
                  <p className="text-[var(--text-1)]">{fmtDate(u.tier_purchased_at)}</p>
                </div>
                <div>
                  <p className="text-[var(--text-3)] font-bold uppercase tracking-wider text-[12px] mb-1">Renews</p>
                  <p className="text-[var(--text-1)]">{fmtDate(u.tier_current_period_end)}</p>
                </div>
                {u.whop_membership_id && (
                  <div className="col-span-2">
                    <p className="text-[var(--text-3)] font-bold uppercase tracking-wider text-[12px] mb-1">Whop Membership ID</p>
                    <p className="text-[var(--text-1)] font-mono">{u.whop_membership_id}</p>
                  </div>
                )}
                {u.admin_granted_tier && (
                  <div className="col-span-2">
                    <p className="text-[var(--text-3)] font-bold uppercase tracking-wider text-[12px] mb-1">Admin Grant</p>
                    <p className="text-[var(--text-1)]">{TIER_LABEL[u.admin_granted_tier as Tier]} — granted {fmtDate(u.admin_granted_tier_at)}</p>
                  </div>
                )}
                {u.discord_advanced_claimed && (
                  <div>
                    <p className="text-[var(--text-3)] font-bold uppercase tracking-wider text-[12px] mb-1">Discord Claim</p>
                    <p className="text-[var(--text-1)]">Eligible for Discord pricing</p>
                  </div>
                )}
              </div>
            )}
            </div>
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
      className={`inline-flex items-center justify-center w-6 h-5 rounded text-[11px] font-semibold ${
        connected ? 'bg-[color-mix(in_srgb,var(--green)_15%,transparent)] text-[var(--green)]' : 'bg-[var(--surface-2)] text-[var(--text-3)]'
      }`}
    >
      {label}
    </span>
  )
}
