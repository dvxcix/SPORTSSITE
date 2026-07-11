import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { AdminUserActions } from '@/components/admin/AdminUserActions'
import { Ban } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminBannedUsersPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  // banned_until lives on auth.users, not public.users — has to come from
  // the Admin Auth API, not a normal table query.
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const bannedAuthUsers = (authList?.users ?? []).filter(
    u => u.banned_until && new Date(u.banned_until) > new Date()
  )

  let profiles: any[] = []
  if (bannedAuthUsers.length) {
    const { data } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, email, account_type, is_verified')
      .in('id', bannedAuthUsers.map(u => u.id))
    profiles = data ?? []
  }
  const profileById = new Map(profiles.map(p => [p.id, p]))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Ban size={20} className="text-red-400" />
        <h1 className="text-xl font-black text-white">Banned Users</h1>
        <span className="text-sm text-zinc-500">{bannedAuthUsers.length} banned</span>
      </div>

      {bannedAuthUsers.length === 0 ? (
        <div className="text-center py-20 text-zinc-500 text-sm">No banned users</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">User</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Banned Until</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {bannedAuthUsers.map(u => {
                const p = profileById.get(u.id)
                return (
                  <tr key={u.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-black text-white overflow-hidden shrink-0">
                          {p?.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" /> : (p?.display_name || p?.username || u.email || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-white">{p?.display_name || p?.username || '(no profile)'}</p>
                          <p className="text-xs text-zinc-500">{p?.email || u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Date(u.banned_until!).getFullYear() > 2090 ? 'Indefinitely' : new Date(u.banned_until!).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {p ? (
                        <AdminUserActions userId={u.id} currentType={p.account_type} isVerified={p.is_verified} bannedUntil={u.banned_until} />
                      ) : (
                        <span className="text-xs text-zinc-600">No profile row</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
