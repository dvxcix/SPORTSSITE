import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Activity } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminOnlineUsersPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const bySignIn = (authList?.users ?? [])
    .filter(u => u.last_sign_in_at)
    .sort((a, b) => new Date(b.last_sign_in_at!).getTime() - new Date(a.last_sign_in_at!).getTime())
    .slice(0, 100)

  let profiles: any[] = []
  if (bySignIn.length) {
    const { data } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', bySignIn.map(u => u.id))
    profiles = data ?? []
  }
  const profileById = new Map(profiles.map(p => [p.id, p]))
  const ACTIVE_WINDOW_MIN = 15

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Activity size={20} className="text-green-400" />
        <h1 className="text-xl font-black text-white">Recently Active Users</h1>
      </div>
      <p className="text-xs text-zinc-500 mb-6">
        Sorted by last sign-in. There's no real-time presence tracking (no websocket/heartbeat) — this is "who signed in most recently," not "who has the app open right now." Anyone within {ACTIVE_WINDOW_MIN} minutes is marked active as a rough proxy.
      </p>

      {bySignIn.length === 0 ? (
        <div className="text-center py-20 text-zinc-500 text-sm">No sign-in data yet</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">User</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Last Sign-In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {bySignIn.map(u => {
                const p = profileById.get(u.id)
                const minsAgo = (Date.now() - new Date(u.last_sign_in_at!).getTime()) / 60000
                const isRecent = minsAgo <= ACTIVE_WINDOW_MIN
                return (
                  <tr key={u.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-black text-white overflow-hidden shrink-0">
                          {p?.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" /> : (p?.display_name || p?.username || u.email || '?')[0].toUpperCase()}
                          {isRecent && <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-400 border border-zinc-900" />}
                        </div>
                        <p className="font-medium text-white">{p?.display_name || p?.username || u.email || '(no profile)'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {isRecent ? <span className="text-green-400 font-bold">Active now</span> : new Date(u.last_sign_in_at!).toLocaleString()}
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
