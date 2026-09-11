import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ThreadReplyForm } from '@/components/forum/ThreadReplyForm'
import { ArrowLeft, Lock, MessageSquareText, Pin } from 'lucide-react'
import type { Metadata } from 'next'
import { CommunityNav } from '@/components/community/CommunityNav'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import Link from 'next/link'
import { ProductPageShell, ProductPanel } from '@/components/product/ProductPage'
import { ForumReactions, type ForumReaction } from '@/components/forum/ForumReactions'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data: thread } = await supabase.from('forum_threads').select('title, content').eq('id', id).single()
  if (!thread) return {}
  return {
    title: `${thread.title} · SlipSurge Forum`,
    description: thread.content?.slice(0, 160) || thread.title,
  }
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: { user } }, { data: thread }, { data: replies }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('forum_threads').select('*, author:users(username, display_name, avatar_url, is_verified), category:forum_categories(name, slug)').eq('id', id).single(),
    supabase.from('forum_replies').select('*, author:users(username, display_name, avatar_url, is_verified)').eq('thread_id', id).order('created_at', { ascending: true }),
  ])
  if (!thread) notFound()

  const targetIds = [thread.id, ...(replies ?? []).map(reply => reply.id)]
  const { data: reactionRows } = targetIds.length
    ? await supabase.from('reactions').select('target_id, emoji, user_id').in('target_id', targetIds).in('target_type', ['forum_thread', 'forum_reply'])
    : { data: [] }
  const reactionsByTarget = new Map<string, ForumReaction[]>()
  for (const reaction of reactionRows ?? []) {
    const current = reactionsByTarget.get(reaction.target_id) ?? []
    current.push({ emoji: reaction.emoji, user_id: reaction.user_id })
    reactionsByTarget.set(reaction.target_id, current)
  }
  const returnPath = `/forum/thread/${thread.id}`

  return (
    <ProductPageShell narrow>
      <CommunityNav />
      <Link href={`/forum/${thread.category?.slug}`} className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 transition hover:text-white"><ArrowLeft size={13} /> {thread.category?.name || 'Discussions'}</Link>
      <header className="mb-4 rounded-[22px] border border-white/[.08] bg-gradient-to-br from-lime-400/[.07] to-white/[.015] p-5 sm:p-6">
        <p className="mb-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[.16em] text-lime-300"><MessageSquareText size={12}/> Thread</p>
        <div className="flex items-start gap-2">
          {thread.is_pinned && <Pin size={14} className="text-green-400 mt-1 shrink-0" />}
          {thread.is_locked && <Lock size={14} className="text-zinc-500 mt-1 shrink-0" />}
          <h1 className="text-2xl font-black leading-tight tracking-[-.035em] text-white sm:text-3xl">{thread.title}</h1>
        </div>
      </header>

      {/* OP */}
      <article className="ss-forum-post is-original">
        <div className="flex items-center gap-3 mb-3">
          <Link href={`/profile/${thread.author?.username}`}><MemberAvatar src={thread.author?.avatar_url} name={thread.author?.display_name || thread.author?.username || 'Member'} size={38} /></Link>
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-1">
              {thread.author?.display_name || thread.author?.username}
              {thread.author?.is_verified && <span className="text-green-400 text-xs">✓</span>}
            </p>
            <p className="text-xs text-zinc-500">{new Date(thread.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>
        {thread.content && <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{thread.content}</p>}
        <ForumReactions targetId={thread.id} targetType="forum_thread" userId={user?.id} ownerId={thread.author_id} initialReactions={reactionsByTarget.get(thread.id) ?? []} returnPath={returnPath} />
      </article>

      {/* Replies */}
      {(replies?.length ?? 0) > 0 && (
        <div className="space-y-3 mb-4">
          {(replies ?? []).map((r: any, i: number) => (
            <article key={r.id} className="ss-forum-post">
              <div className="flex items-center gap-3 mb-3">
                <Link href={`/profile/${r.author?.username}`}><MemberAvatar src={r.author?.avatar_url} name={r.author?.display_name || r.author?.username || 'Member'} size={34} /></Link>
                <div>
                  <p className="text-sm font-bold text-white flex items-center gap-1">
                    {r.author?.display_name || r.author?.username}
                    {r.author?.is_verified && <span className="text-green-400 text-xs">✓</span>}
                  </p>
                  <p className="text-xs text-zinc-500">#{i + 1} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{r.content}</p>
              <ForumReactions targetId={r.id} targetType="forum_reply" userId={user?.id} ownerId={r.author_id} initialReactions={reactionsByTarget.get(r.id) ?? []} returnPath={returnPath} />
            </article>
          ))}
        </div>
      )}

      {!thread.is_locked && user && <ThreadReplyForm userId={user.id} threadId={thread.id} threadAuthorId={thread.author_id} />}
      {!thread.is_locked && !user && (
        <ProductPanel padded className="text-center">
          <p className="text-sm text-zinc-400 mb-3">Sign in to reply</p>
          <Link href={`/auth/login?next=/forum/thread/${thread.id}`} className="inline-block bg-green-500 hover:bg-green-400 text-black font-black px-6 py-2 rounded-xl text-sm transition-colors">Sign In</Link>
        </ProductPanel>
      )}
      {thread.is_locked && (
        <ProductPanel padded className="text-center">
          <p className="text-sm text-zinc-500 flex items-center justify-center gap-2"><Lock size={14} /> This thread is locked</p>
        </ProductPanel>
      )}
    </ProductPageShell>
  )
}
