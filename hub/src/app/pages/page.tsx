import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, Plus, Sparkles, Star, Users } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductAction, ProductHero, ProductPageShell, ProductPanel, ProductSectionHeader } from '@/components/product/ProductPage'
import Image from 'next/image'

export const revalidate = 60
const CATEGORIES = ['All', 'Team', 'Athlete', 'Media', 'Brand', 'Community', 'Podcast'] as const

export default async function PagesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const supabase = await createClient()
  const [{ data: { user } }, params] = await Promise.all([supabase.auth.getUser(), searchParams])
  const activeCategory = CATEGORIES.includes(params.category as typeof CATEGORIES[number]) ? params.category! : 'All'
  let query = supabase.from('pages').select('*').eq('is_published', true).order('follower_count', { ascending: false }).limit(40)
  if (activeCategory !== 'All') query = query.eq('category', activeCategory)
  const { data: pages } = await query

  return (
    <ProductPageShell>
      <CommunityNav />
      <ProductHero icon={<Star size={22} />} eyebrow="Public profiles" title="Pages" description="Follow the teams, athletes, brands, and communities shaping the conversation." actions={user ? <ProductAction href="/pages/create"><Plus size={15} /> Create page</ProductAction> : undefined} />
      <nav className="ss-picks-filters" aria-label="Page categories">{CATEGORIES.map(category => <Link key={category} href={category === 'All' ? '/pages' : `/pages?category=${encodeURIComponent(category)}`} className={activeCategory === category ? 'is-active' : ''} aria-current={activeCategory === category ? 'page' : undefined}>{category}</Link>)}</nav>
      <ProductSectionHeader title={activeCategory === 'All' ? 'Popular pages' : activeCategory} meta={`${pages?.length ?? 0} results`} />
      {!pages?.length ? (
        <ProductPanel padded className="text-center"><Sparkles className="mx-auto text-zinc-600" size={28} /><p className="mt-3 font-black text-white">No pages here yet</p>{user && <Link href="/pages/create" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-xs font-black text-black"><Plus size={14} /> Create page</Link>}</ProductPanel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{pages.map((page: any) => <Link key={page.id} href={`/pages/${page.slug}`} className="group flex items-center gap-4 rounded-2xl border border-white/[.08] bg-gradient-to-br from-white/[.04] to-white/[.015] p-4 transition hover:-translate-y-0.5 hover:border-lime-400/25">
          <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.05] text-2xl">{page.avatar_url ? <Image src={page.avatar_url} alt="" fill sizes="56px" className="object-cover" /> : page.emoji ?? '⭐'}</div>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h2 className="truncate text-sm font-black text-white">{page.name}</h2>{page.is_verified && <BadgeCheck size={14} className="shrink-0 text-sky-400" aria-label="Verified" />}</div><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{page.description || page.category || 'SlipSurge page'}</p><p className="mt-2 flex items-center gap-1 text-[10px] font-bold text-zinc-600"><Users size={11} />{page.follower_count ?? 0} followers</p></div>
          <ArrowRight size={16} className="text-zinc-700 transition group-hover:translate-x-1 group-hover:text-lime-300" />
        </Link>)}</div>
      )}
    </ProductPageShell>
  )
}
