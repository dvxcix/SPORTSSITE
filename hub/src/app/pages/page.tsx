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
        <ProductPanel padded className="text-center"><Sparkles className="mx-auto text-[var(--text-3)]" size={28} /><p className="mt-3 font-semibold text-[var(--text-1)]">No pages here yet</p>{user && <Link href="/pages/create" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-fill)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-fg)]"><Plus size={14} /> Create page</Link>}</ProductPanel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{pages.map((page: any) => <Link key={page.id} href={`/pages/${page.slug}`} className="group flex items-center gap-4 rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-gradient-to-br from-white/[.04] to-white/[.015] p-4 transition hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)]">
          <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[rgba(var(--contrast-rgb),0.05)] text-2xl">{page.avatar_url ? <Image src={page.avatar_url} alt="" fill sizes="56px" className="object-cover" /> : page.emoji ?? '⭐'}</div>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h2 className="truncate text-sm font-semibold text-[var(--text-1)]">{page.name}</h2>{page.is_verified && <BadgeCheck size={14} className="shrink-0 text-[var(--blue)]" aria-label="Verified" />}</div><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-3)]">{page.description || page.category || 'SlipSurge page'}</p><p className="mt-2 flex items-center gap-1 text-[12px] font-bold text-[var(--text-3)]"><Users size={11} />{page.follower_count ?? 0} followers</p></div>
          <ArrowRight size={16} className="text-[var(--text-3)] transition group-hover:translate-x-1 group-hover:text-[var(--accent)]" />
        </Link>)}</div>
      )}
    </ProductPageShell>
  )
}
