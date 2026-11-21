import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowRight, BookOpen, Clock, Eye, FilePenLine, Plus, Sparkles } from 'lucide-react'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductAction, ProductHero, ProductPageShell, ProductPanel, ProductSectionHeader } from '@/components/product/ProductPage'
import { SafeImage } from '@/components/ui/SafeImage'
import type { MemberRingStyle } from '@/components/social/MemberAvatar'

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
  author?: { username?: string | null; display_name?: string | null; avatar_url?: string | null; avatar_ring_style?: MemberRingStyle | null; avatar_ring_color?: string | null } | null
}

export default async function BlogPage() {
  const supabase = await createClient()
  const [{ data: { user } }, { data: blogs }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('blogs').select('*, author:users(username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, is_verified)').eq('status', 'published').order('created_at', { ascending: false }).limit(20),
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
        <ProductPanel padded className="text-center"><Sparkles className="mx-auto text-[var(--text-3)]" size={28} /><p className="mt-3 font-semibold text-[var(--text-1)]">No articles yet</p>{user && <Link href="/blog/create" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-fill)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-fg)]"><Plus size={14} /> Write the first article</Link>}</ProductPanel>
      ) : (
        <>
          <ArticleCard article={lead} featured />
          {rest.length > 0 && <><ProductSectionHeader title="Latest" meta={`${rest.length} ${rest.length === 1 ? 'article' : 'articles'}`} /><div className="grid gap-3 md:grid-cols-2">{rest.map(article => <ArticleCard key={article.id} article={article} />)}</div></>}
        </>
      )}
    </ProductPageShell>
  )
}

function ArticleCard({ article, featured = false }: { article: Article; featured?: boolean }) {
  return <Link href={`/blog/${article.slug}`} className={`group overflow-hidden rounded-xl border border-[rgba(var(--line-rgb),0.08)] bg-[var(--surface)] transition hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] ${featured && article.cover_image ? 'grid md:grid-cols-[1.05fr_.95fr]' : 'block'}`}>
    {article.cover_image && <div className={`relative overflow-hidden bg-[var(--surface-2)] ${featured ? 'min-h-48' : 'h-40'}`}><SafeImage src={article.cover_image} alt="" className="h-full w-full object-cover" /></div>}
      <div className={`flex flex-col ${featured ? 'justify-center p-6 sm:p-8' : 'p-4'}`}>
      {article.category && <span className="text-[11px] font-semibold tracking-normal text-[var(--accent)]">{article.category}</span>}
      <h2 className={`mt-2 font-semibold leading-tight tracking-[-.03em] text-[var(--text-1)] ${featured ? 'text-2xl sm:text-3xl' : 'text-base'}`}>{article.title}</h2>
      {article.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-2)]">{article.excerpt}</p>}
      <div className="mt-5 flex items-center gap-2.5"><MemberAvatar src={article.author?.avatar_url} name={article.author?.display_name || article.author?.username || 'Author'} size={28} ringStyle={article.author?.avatar_ring_style} ringColor={article.author?.avatar_ring_color} /><span className="min-w-0 truncate text-xs font-bold text-[var(--text-2)]">{article.author?.display_name || article.author?.username}</span><span className="ml-auto flex shrink-0 items-center gap-3 text-[12px] font-bold text-[var(--text-3)]"><span className="flex items-center gap-1"><Clock size={11} />{new Date(article.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>{(article.view_count ?? 0) > 0 && <span className="flex items-center gap-1"><Eye size={11} />{article.view_count}</span>}<ArrowRight size={13} className="transition group-hover:translate-x-1 group-hover:text-[var(--accent)]" /></span></div>
    </div>
  </Link>
}
