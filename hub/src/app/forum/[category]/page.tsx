import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MessageSquare, Plus, Pin, Lock } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { ProductAction, ProductHero, ProductPageShell, ProductPanel } from '@/components/product/ProductPage'

export const dynamic = 'force-dynamic'

export default async function ForumCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  const supabase = await createClient()
  const [{ data: { user } }, { data: cat }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('forum_categories').select('*').eq('slug', category).single(),
  ])
  if (!cat) notFound()

  const { data: threads } = await supabase
    .from('forum_threads')
    .select('*, author:users(username, display_name, avatar_url, is_verified)')
    .eq('category_id', cat.id)
    .order('is_pinned', { ascending: false })
    .order('last_reply_at', { ascending: false })
    .limit(30)

  return (
    <ProductPageShell narrow>
      <CommunityNav />
      <Link href="/forum" className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 transition hover:text-white"><ArrowLeft size={13} /> Discussions</Link>
      <ProductHero icon={<span className="text-xl">{cat.icon || <MessageSquare size={21} />}</span>} eyebrow="Discussion board" title={cat.name} description={cat.description || 'Community conversation'} actions={user ? <ProductAction href={`/forum/new?category=${cat.id}`}><Plus size={14} /> New thread</ProductAction> : undefined} />

      {(threads?.length ?? 0) === 0 ? (
        <ProductPanel padded className="text-center"><MessageSquare size={28} className="mx-auto text-zinc-600"/><p className="mt-3 font-black text-white">No threads yet</p>{user && <Link href={`/forum/new?category=${cat.id}`} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-xs font-black text-black"><Plus size={14}/> Start one</Link>}</ProductPanel>
      ) : (
        <div className="space-y-2">
          {(threads ?? []).map((t: any) => (
            <Link key={t.id} href={`/forum/thread/${t.id}`}
              className={`ss-forum-thread ${t.is_pinned ? 'is-pinned' : ''}`}>
              <MemberAvatar src={t.author?.avatar_url} name={t.author?.display_name || t.author?.username || 'Member'} size={38} />
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
    </ProductPageShell>
  )
}
