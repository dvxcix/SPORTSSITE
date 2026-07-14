import { createClient } from '@/lib/supabase/server'
import { Users, FileText, MessageSquare, TrendingUp, Star, Calendar, Flag, Activity } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const [
    { count: userCount },
    { count: postCount },
    { count: groupCount },
    { count: reportCount },
    { data: recentUsers },
    { data: recentPosts },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('posts').select('*', { count: 'exact', head: true }),
    supabase.from('groups').select('*', { count: 'exact', head: true }),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('users').select('id, username, display_name, avatar_url, account_type, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('posts').select('id, content, created_at, author:users!posts_author_id_fkey(username)').order('created_at', { ascending: false }).limit(5),
  ])

  const stats = [
    { label: 'Total Users', value: userCount ?? 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Total Posts', value: postCount ?? 0, icon: FileText, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Groups', value: groupCount ?? 0, icon: MessageSquare, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Pending Reports', value: reportCount ?? 0, icon: Flag, color: 'text-red-400', bg: 'bg-red-500/10' },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">Dashboard</h1>
        <p className="text-sm text-zinc-500">SlipSurge Admin Control Panel</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-zinc-500">{s.label}</p>
                <div className={`p-2 rounded-lg ${s.bg}`}>
                  <Icon size={14} className={s.color} />
                </div>
              </div>
              <p className="text-3xl font-black text-white">{s.value.toLocaleString()}</p>
            </div>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent users */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-white">Recent Signups</h2>
            <a href="/admin/users" className="text-xs text-green-400 hover:text-green-300">View all →</a>
          </div>
          <div className="divide-y divide-zinc-800">
            {(recentUsers ?? []).map((u: any) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-black text-white overflow-hidden shrink-0">
                  {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.display_name || u.username}</p>
                  <p className="text-xs text-zinc-500">@{u.username}</p>
                </div>
                <div className="flex items-center gap-2">
                  {u.account_type !== 'user' && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${u.account_type === 'admin' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                      {u.account_type.toUpperCase()}
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-600">{new Date(u.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent posts */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-white">Recent Posts</h2>
            <a href="/admin/content/posts" className="text-xs text-green-400 hover:text-green-300">View all →</a>
          </div>
          <div className="divide-y divide-zinc-800">
            {(recentPosts ?? []).map((p: any) => (
              <div key={p.id} className="px-4 py-3">
                <p className="text-xs text-zinc-500 mb-1">@{p.author?.username}</p>
                <p className="text-sm text-zinc-300 line-clamp-2">{p.content}</p>
                <p className="text-[10px] text-zinc-600 mt-1">{new Date(p.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
