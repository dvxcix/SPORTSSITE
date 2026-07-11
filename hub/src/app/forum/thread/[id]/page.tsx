import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ThreadReplyForm } from '@/components/forum/ThreadReplyForm'
import { Pin, Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: thread } = await supabase
    .from('forum_threads')
    .select('*, author:users(username, display_name, avatar_url, is_verified), category:forum_categories(name, slug)')
    .eq('id', id)
    .single()
  if (!thread) notFound()

  const { data: replies } = await supabase
    .from('forum_replies')
    .select('*, author:users(username, display_name, avatar_url, is_verified)')
    .eq('thread_id', id)
    .order('created_at', { ascending: true })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2 text-xs text-zinc-500">
          <a href="/forum" className="hover:text-zinc-300">Forum</a>
          <span>/</span>
          <a href={`/forum/${thread.category?.slug}`} className="hover:text-zinc-300">{thread.category?.name}</a>
        </div>
        <div className="flex items-start gap-2">
          {thread.is_pinned && <Pin size={14} className="text-green-400 mt-1 shrink-0" />}
          {thread.is_locked && <Lock size={14} className="text-zinc-500 mt-1 shrink-0" />}
          <h1 className="text-xl font-black text-white leading-tight">{thread.title}</h1>
        </div>
      </div>

      {/* OP */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden">
            {thread.author?.avatar_url && <img src={thread.author.avatar_url} alt="" className="w-full h-full object-cover" />}
          </div>
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-1">
              {thread.author?.display_name || thread.author?.username}
              {thread.author?.is_verified && <span className="text-green-400 text-xs">✓</span>}
            </p>
            <p className="text-xs text-zinc-500">{new Date(thread.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>
        {thread.content && <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{thread.content}</p>}
      </div>

      {/* Replies */}
      {(replies?.length ?? 0) > 0 && (
        <div className="space-y-3 mb-4">
          {(replies ?? []).map((r: any, i: number) => (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden">
                  {r.author?.avatar_url && <img src={r.author.avatar_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-white flex items-center gap-1">
                    {r.author?.display_name || r.author?.username}
                    {r.author?.is_verified && <span className="text-green-400 text-xs">✓</span>}
                  </p>
                  <p className="text-xs text-zinc-500">#{i + 1} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{r.content}</p>
            </div>
          ))}
        </div>
      )}

      {!thread.is_locked && user && <ThreadReplyForm userId={user.id} threadId={thread.id} />}
      {!thread.is_locked && !user && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <p className="text-sm text-zinc-400 mb-3">Sign in to reply</p>
          <a href="/auth/login" className="inline-block bg-green-500 hover:bg-green-400 text-black font-black px-6 py-2 rounded-xl text-sm transition-colors">Sign In</a>
        </div>
      )}
      {thread.is_locked && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <p className="text-sm text-zinc-500 flex items-center justify-center gap-2"><Lock size={14} /> This thread is locked</p>
        </div>
      )}
    </div>
  )
}
