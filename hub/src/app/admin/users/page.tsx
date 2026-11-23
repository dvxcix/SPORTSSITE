import { createAdminClient } from '@/lib/supabase/admin'
import { AdminUserRow, type AdminUserRecord } from '@/components/admin/AdminUserRow'
import { TerminateMembershipTool } from '@/components/admin/TerminateMembershipTool'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import styles from '@/components/admin/adminWorkspace.module.css'
import { effectiveTier, hasTierAccess, type Tier } from '@slipsurge/core/tiers'

export const dynamic = 'force-dynamic'

function tierSubLabel(u: AdminUserRecord): string | null {
  if (u.account_type === 'admin') return 'Admin'
  if (u.beta_access_active) return 'Beta'
  const rawTier: Tier = (u.tier as Tier) ?? 'free'
  if (u.admin_granted_tier && !hasTierAccess(rawTier, u.admin_granted_tier)) return 'Admin grant'
  return null
}

export default async function AdminUsersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; type?: string; tier?: string }> }) {
  const { q, type, tier: tierFilter } = await searchParams
  const admin = createAdminClient()

  let query = admin.from('users')
    .select('id, username, display_name, avatar_url, email, account_type, is_verified, is_active_member, follower_count, created_at, tier, discord_advanced_claimed, admin_granted_tier, admin_granted_tier_at, beta_access_active, verified_identities, whop_user_id, whop_plan_id, tier_status, tier_current_period_end, tier_purchased_at, whop_membership_id')
    .order('created_at', { ascending: false })

  if (q) query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%,email.ilike.%${q}%`)
  if (type) query = query.eq('account_type', type)

  // Tier filter operates on the EFFECTIVE tier (real purchase + admin
  // grant) — not a raw column, so it can't be pushed into the
  // query itself. Fetch a wider recency-ordered window, fold it in JS with
  // the exact same effectiveTier() used everywhere else, then take the
  // first 50 matches — bounded fetch (not a full table scan), and it stays
  // honest with what the Tier column on this page actually shows.
  const fetchLimit = tierFilter ? 500 : 50
  query = query.limit(fetchLimit)

  const { data: rawUsers, error: memberError } = await query
  let users = (rawUsers ?? []) as AdminUserRecord[]
  if (tierFilter) {
    users = users.filter(u => effectiveTier((u.tier as Tier) ?? 'free', u.discord_advanced_claimed, u.admin_granted_tier as Tier | null) === tierFilter)
  }
  users = users.slice(0, 50)

  const ids = users.map(u => u.id)
  const { data: emailRows } = ids.length
    ? await admin.from('admin_user_email_status').select('id, email_verified').in('id', ids)
    : { data: [] as { id: string; email_verified: boolean }[] }
  const emailVerifiedMap = new Map((emailRows ?? []).map(r => [r.id, r.email_verified]))

  return (
    <div className="ss-admin-users min-w-0 p-4 sm:p-6 max-w-6xl mx-auto">
      <AdminPageHeader title="Members" description="Find an account, check access and manage member support." icon={Users} actions={<Link className={styles.toolButton} href="/admin/users/deletions">Deletion requests</Link>} />

      <form action="/admin/users" method="get" aria-label="Find member accounts" className={styles.memberFilters}>
        <label>Find an account<input name="q" defaultValue={q} placeholder="Name, username or email" type="search" /></label>
        <label>Account type<select name="type" defaultValue={type ?? ''}>{[['', 'All accounts'], ['user', 'Members'], ['creator', 'Creators'], ['admin', 'Admins']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Membership<select name="tier" defaultValue={tierFilter ?? ''}>{[['', 'All memberships'], ['free', 'Free'], ['basic', 'Basic'], ['advanced', 'Advanced'], ['ultimate', 'Ultimate']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div><button type="submit" className={styles.toolButton}>Find members</button>{(q || type || tierFilter) && <Link href="/admin/users" className={styles.toolButton}>Reset</Link>}</div>
      </form>
      <div className={styles.resultSummary}><span>{memberError ? 'Member search unavailable' : `${users.length} ${users.length === 1 ? 'account' : 'accounts'} shown`}</span><span>{tierFilter ? 'Membership filter checks the 500 most recent accounts.' : 'Up to 50 accounts, newest first.'}</span></div>
      {memberError && <p role="alert" className={`${styles.notice} mb-4`}>Member accounts could not be loaded. Submit the search again to retry.</p>}

      {/* Table */}
      <div role="region" tabIndex={0} aria-label="Member accounts, scroll for all columns" className="ss-table-region min-w-0 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Member accounts and access</caption>
          <thead className="border-b border-[var(--border)]">
            <tr className="text-left">
              <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">User</th>
              <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Type</th>
              <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Tier</th>
              <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Connections</th>
              <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Email</th>
              <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Followers</th>
              <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Joined</th>
              <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {!users.length && <tr><td colSpan={8} className="px-4 py-8 text-sm text-[var(--text-3)]">{memberError ? 'Accounts are temporarily unavailable.' : q || type || tierFilter ? 'No accounts match these filters. Adjust the search or reset the filters.' : 'No member accounts to display.'}</td></tr>}
            {users.map(u => {
              const rawTier: Tier = (u.tier as Tier) ?? 'free'
              const displayTier = effectiveTier(rawTier, u.discord_advanced_claimed, u.admin_granted_tier as Tier | null)
              const subLabel = tierSubLabel(u)
              const emailVerified = emailVerifiedMap.get(u.id) ?? false
              return (
                <AdminUserRow key={u.id} user={u} displayTier={displayTier} subLabel={subLabel} emailVerified={emailVerified} />
              )
            })}
          </tbody>
        </table>
      </div>
      <details className={styles.memberAdvanced}><summary>Advanced membership actions</summary><TerminateMembershipTool /></details>
    </div>
  )
}
