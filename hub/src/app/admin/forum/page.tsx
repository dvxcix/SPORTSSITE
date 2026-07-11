import { createClient } from '@/lib/supabase/server'
import { AdminForumActions } from '@/components/admin/AdminForumActions'
import { MessageSquare, Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminForumPage() {
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('forum_categories')
    .select('*')
    .order('sort_order')

  const { data: threads } = await supabase
    .from('forum_threads')
    .select('*, author:users(username), category:forum_categories(name)')
    .order('created_at', { ascending: false })
    .limit(30)

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare size={20} className="text-orange-400" />
        <h1 className="text-xl font-black text-white">Forum Management</h1>
      </div>

      <h2 className="text-sm font-bold text-zinc-400 mb-3">Categories</h2>
      <div className="space-y-2 mb-8">
        {(categories ?? []).map((c: any) => (
          <div key={c.id} className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            <span className="text-xl">{c.icon}</span>
            <div className="flex-1">
              <p className="font-bold text-white text-sm">{c.name}</p>
              <p className="text-xs text-zinc-500">{c.thread_count ?? 0} threads{c.sport ? ` · ${c.sport}` : ''}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${c.sport ? 'text-blue-400 bg-blue-400/10' : 'text-zinc-500 bg-zinc-800'}`}>{c.sport ?? 'General'}</span>
          </div>
        ))}
      </div>

      <h2 className="text-sm font-bold text-zinc-400 mb-3">Recent Threads</h2>
      <div className="space-y-2">
        {(threads ?? []).map((t: any) => (
          <div key={t.id} className="flex items-start gap-4 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-sm truncate">{t.title}</p>
              <p className="text-xs text-zinc-500">by @{t.author?.username} · {t.category?.name} · {new Date(t.created_at).toLocaleDateString()}</p>
            </div>
            <AdminForumActions threadId={t.id} isPinned={t.is_pinned} isLocked={t.is_locked} />
          </div>
        ))}
      </div>
    </div>
  )
}
