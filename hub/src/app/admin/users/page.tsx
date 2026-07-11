import { createClient } from '@/lib/supabase/server'
import { AdminUserActions } from '@/components/admin/AdminUserActions'
import { Search } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q, type } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('users')
    .select('id, username, display_name, avatar_url, email, account_type, is_verified, is_active_member, follower_count, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (q) query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%,email.ilike.%${q}%`)
  if (type) query = query.eq('account_type', type)

  const { data: users } = await query

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-black text-white">Manage Users</h1>
        <span className="text-sm text-zinc-500">{users?.length ?? 0} results</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
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
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800">
            <tr className="text-left">
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">User</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Type</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Followers</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Joined</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {(users ?? []).map((u: any) => (
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
                <td className="px-4 py-3 text-zinc-400">{u.follower_count ?? 0}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <AdminUserActions userId={u.id} currentType={u.account_type} isVerified={u.is_verified} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
