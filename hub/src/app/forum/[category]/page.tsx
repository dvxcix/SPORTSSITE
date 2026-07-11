import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MessageSquare, Plus, Pin, Lock, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ForumCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: cat } = await supabase.from('forum_categories').select('*').eq('slug', category).single()
  if (!cat) notFound()

  const { data: threads } = await supabase
    .from('forum_threads')
    .select('*, author:users(username, display_name, avatar_url, is_verified)')
    .eq('category_id', cat.id)
    .order('is_pinned', { ascending: false })
    .order('last_reply_at', { ascending: false })
    .limit(30)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/forum" className="text-xs text-zinc-500 hover:text-zinc-300">Forum</Link>
            <span className="text-zinc-700">/</span>
            <span className="text-xs text-zinc-400">{cat.name}</span>
          </div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            {cat.icon} {cat.name}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">{cat.description}</p>
        </div>
        {user && (
          <Link href={`/forum/new?category=${cat.id}`}
            className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors shrink-0">
            <Plus size={14} /> New Thread
          </Link>
        )}
      </div>

      {(threads?.length ?? 0) === 0 ? (
        <div className="text-center py-20">
          <p className="text-3xl mb-3">💬</p>
          <p className="text-zinc-400">No threads yet — start the conversation</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(threads ?? []).map((t: any) => (
            <Link key={t.id} href={`/forum/thread/${t.id}`}
              className={`flex gap-4 bg-zinc-900 border rounded-xl p-4 hover:border-zinc-700 transition-all ${t.is_pinned ? 'border-green-500/30' : 'border-zinc-800'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {t.is_pinned && <Pin size={11} className="text-green-400 shrink-0" />}
                  {t.is_locked && <Lock size={11} className="text-zinc-500 shrink-0" />}
                  <p className="font-bold text-white truncate">{t.title}</p>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  by @{t.author?.display_name || t.author?.username} · {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-white">{t.reply_count ?? 0}</p>
                <p className="text-xs text-zinc-600">replies</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
