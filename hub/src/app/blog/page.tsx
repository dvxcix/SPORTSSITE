import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowRight, BookOpen, Clock, Eye, FilePenLine, Plus, Sparkles } from 'lucide-react'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductAction, ProductHero, ProductPageShell, ProductPanel, ProductSectionHeader } from '@/components/product/ProductPage'

export const revalidate = 60

type Article = {
  id: string
  slug: string
  title: string
  excerpt?: string | null
  category?: string | null
  cover_image?: string | null
  created_at: string
  view_count?: number | null
  author?: { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null
}

export default async function BlogPage() {
  const supabase = await createClient()
  const [{ data: { user } }, { data: blogs }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('blogs').select('*, author:users(username, display_name, avatar_url, is_verified)').eq('status', 'published').order('created_at', { ascending: false }).limit(20),
  ])
  const [lead, ...rest] = (blogs ?? []) as Article[]

  return (
    <ProductPageShell>
      <CommunityNav />
      <ProductHero
        icon={<BookOpen size={22} />}
        eyebrow="Editorial"
        title="Stories & analysis"
        description="Long-form breakdowns from the SlipSurge community."
        actions={user ? <><ProductAction href="/blog/my"><FilePenLine size={14} /> My articles</ProductAction><ProductAction href="/blog/create"><Plus size={14} /> Write</ProductAction></> : undefined}
      />
      {!lead ? (
        <ProductPanel padded className="text-center"><Sparkles className="mx-auto text-zinc-600" size={28} /><p className="mt-3 font-black text-white">No articles yet</p>{user && <Link href="/blog/create" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-xs font-black text-black"><Plus size={14} /> Write the first article</Link>}</ProductPanel>
      ) : (
        <>
          <ArticleCard article={lead} featured />
          {rest.length > 0 && <><ProductSectionHeader title="Latest" meta={`${rest.length} articles`} /><div className="grid gap-3 md:grid-cols-2">{rest.map(article => <ArticleCard key={article.id} article={article} />)}</div></>}
        </>
      )}
    </ProductPageShell>
  )
}

function ArticleCard({ article, featured = false }: { article: Article; featured?: boolean }) {
  return <Link href={`/blog/${article.slug}`} className={`group overflow-hidden rounded-[22px] border border-white/[.08] bg-gradient-to-br from-white/[.04] to-white/[.015] transition hover:-translate-y-0.5 hover:border-lime-400/25 ${featured ? 'grid md:grid-cols-[1.05fr_.95fr]' : 'block'}`}>
    <div className={`relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(163,230,53,.17),transparent_42%),#121612] ${featured ? 'min-h-64' : 'h-40'}`}>
      {article.cover_image ? <img src={article.cover_image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" /> : <BookOpen className="absolute bottom-6 left-6 text-lime-300/40" size={featured ? 54 : 38} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
    </div>
      <div className={`flex flex-col ${featured ? 'justify-center p-6 sm:p-8' : 'p-4'}`}>
      {article.category && <span className="text-[9px] font-black uppercase tracking-[.16em] text-lime-300">{article.category}</span>}
      <h2 className={`mt-2 font-black leading-tight tracking-[-.03em] text-white ${featured ? 'text-2xl sm:text-3xl' : 'text-base'}`}>{article.title}</h2>
      {article.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-400">{article.excerpt}</p>}
      <div className="mt-5 flex items-center gap-2.5"><MemberAvatar src={article.author?.avatar_url} name={article.author?.display_name || article.author?.username || 'Author'} size={28} /><span className="min-w-0 truncate text-xs font-bold text-zinc-300">{article.author?.display_name || article.author?.username}</span><span className="ml-auto flex shrink-0 items-center gap-3 text-[10px] font-bold text-zinc-600"><span className="flex items-center gap-1"><Clock size={11} />{new Date(article.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>{(article.view_count ?? 0) > 0 && <span className="flex items-center gap-1"><Eye size={11} />{article.view_count}</span>}<ArrowRight size={13} className="transition group-hover:translate-x-1 group-hover:text-lime-300" /></span></div>
    </div>
  </Link>
}
