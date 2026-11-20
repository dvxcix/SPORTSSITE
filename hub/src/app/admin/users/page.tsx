import { createAdminClient } from '@/lib/supabase/admin'
import { AdminUserRow, type AdminUserRecord } from '@/components/admin/AdminUserRow'
import { TerminateMembershipTool } from '@/components/admin/TerminateMembershipTool'
import { Search } from 'lucide-react'
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

  const { data: rawUsers } = await query
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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[var(--text-1)]">Manage Users</h1>
        <span className="text-sm text-[var(--text-3)]">{users.length} results</span>
      </div>

      <TerminateMembershipTool />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <form>
            <input name="q" defaultValue={q} placeholder="Search users…"
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-9 pr-4 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)]" />
          </form>
        </div>
        <div className="flex gap-1">
          {[['', 'All'], ['user', 'Users'], ['creator', 'Creators'], ['admin', 'Admins']].map(([val, label]) => (
            <a key={val} href={val ? `/admin/users?type=${val}` : '/admin/users'}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${type === val || (!type && !val) ? 'bg-[var(--surface-2)] text-[var(--text-1)]' : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[color-mix(in_srgb,var(--surface-2)_60%,transparent)]'}`}>
              {label}
            </a>
          ))}
        </div>
        <div className="flex gap-1">
          {[['', 'All Tiers'], ['free', 'Free'], ['basic', 'Basic'], ['advanced', 'Advanced'], ['ultimate', 'Ultimate']].map(([val, label]) => (
            <a key={val} href={val ? `/admin/users?tier=${val}` : '/admin/users'}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${tierFilter === val || (!tierFilter && !val) ? 'bg-[var(--surface-2)] text-[var(--text-1)]' : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[color-mix(in_srgb,var(--surface-2)_60%,transparent)]'}`}>
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
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
    </div>
  )
}
