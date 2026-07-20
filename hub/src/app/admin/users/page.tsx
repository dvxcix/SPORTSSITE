import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminUserActions } from '@/components/admin/AdminUserActions'
import { Search } from 'lucide-react'
import { effectiveTier, hasTierAccess, TIER_LABEL, type Tier } from '@/lib/tiers'

export const dynamic = 'force-dynamic'

function tierSubLabel(u: any): string | null {
  if (u.account_type === 'admin') return 'Admin'
  if (u.beta_access_active) return 'Beta'
  const rawTier: Tier = (u.tier as Tier) ?? 'free'
  if (u.admin_granted_tier && !hasTierAccess(rawTier, u.admin_granted_tier)) return 'Admin grant'
  if (u.discord_advanced_claimed && !hasTierAccess(rawTier, 'advanced')) return 'via Discord'
  return null
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

export default async function AdminUsersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; type?: string; tier?: string }> }) {
  const { q, type, tier: tierFilter } = await searchParams
  const supabase = await createClient()
  const admin = createAdminClient()

  let query = supabase.from('users')
    .select('id, username, display_name, avatar_url, email, account_type, is_verified, is_active_member, follower_count, created_at, tier, discord_advanced_claimed, admin_granted_tier, beta_access_active, verified_identities, whop_user_id')
    .order('created_at', { ascending: false })

  if (q) query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%,email.ilike.%${q}%`)
  if (type) query = query.eq('account_type', type)

  // Tier filter operates on the EFFECTIVE tier (real purchase + Discord
  // claim + admin grant) — not a raw column, so it can't be pushed into the
  // query itself. Fetch a wider recency-ordered window, fold it in JS with
  // the exact same effectiveTier() used everywhere else, then take the
  // first 50 matches — bounded fetch (not a full table scan), and it stays
  // honest with what the Tier column on this page actually shows.
  const fetchLimit = tierFilter ? 500 : 50
  query = query.limit(fetchLimit)

  const { data: rawUsers } = await query
  let users = rawUsers ?? []
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
        <h1 className="text-xl font-black text-white">Manage Users</h1>
        <span className="text-sm text-zinc-500">{users.length} results</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <form>
            <input name="q" defaultValue={q} placeholder="Search users…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
          </form>
        </div>
        <div className="flex gap-1">
          {[['', 'All'], ['user', 'Users'], ['creator', 'Creators'], ['admin', 'Admins']].map(([val, label]) => (
            <a key={val} href={val ? `/admin/users?type=${val}` : '/admin/users'}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${type === val || (!type && !val) ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60'}`}>
              {label}
            </a>
          ))}
        </div>
        <div className="flex gap-1">
          {[['', 'All Tiers'], ['free', 'Free'], ['basic', 'Basic'], ['advanced', 'Advanced'], ['ultimate', 'Ultimate']].map(([val, label]) => (
            <a key={val} href={val ? `/admin/users?tier=${val}` : '/admin/users'}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${tierFilter === val || (!tierFilter && !val) ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60'}`}>
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800">
            <tr className="text-left">
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">User</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Type</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Tier</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Connections</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Email</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Followers</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Joined</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {users.map((u: any) => {
              const rawTier: Tier = (u.tier as Tier) ?? 'free'
              const displayTier = effectiveTier(rawTier, u.discord_advanced_claimed, u.admin_granted_tier as Tier | null)
              const subLabel = tierSubLabel(u)
              const emailVerified = emailVerifiedMap.get(u.id) ?? false
              return (
                <tr key={u.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
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
                    </div>
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
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
