import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PostCardClient } from '@/components/social/PostCardClient'
import { PageFollowButton } from '@/components/pages/PageFollowButton'
import { FeedComposer } from '@/components/social/FeedComposer'
import { BadgeCheck, Calendar, ChevronLeft, Settings2, Users } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductPageShell } from '@/components/product/ProductPage'
import type { Metadata } from 'next'
import { SafeImage } from '@/components/ui/SafeImage'
import { hydrateVisibleAuthorRecords } from '@/lib/visiblePickRecords'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: page } = await supabase.from('pages').select('name, description, banner_url').eq('slug', slug).single()
  if (!page) return {}
  const description = page.description || `${page.name} on SlipSurge`
  return { title: `${page.name} · SlipSurge`, description, openGraph: { title: page.name, description, images: page.banner_url ? [page.banner_url] : undefined } }
}

export default async function PageDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const [{ data: { user } }, { data: page }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('pages').select('*').eq('slug', slug).single(),
  ])
  if (!page) notFound()
  const isOwner = user?.id === page.owner_id
  const [{ data: follow }, { data: rawPosts }] = await Promise.all([
    user ? supabase.from('page_follows').select('id').eq('user_id', user.id).eq('page_id', page.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('posts').select('*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, bio, follower_count, is_verified, account_type, tier, beta_access_active)').eq('page_id', page.id).order('created_at', { ascending: false }).limit(20),
  ])
  const enriched = await attachUserReactions(rawPosts ?? [], user?.id)
  const { posts } = await hydrateVisibleAuthorRecords(supabase, enriched)

  return (
    <ProductPageShell narrow>
      <CommunityNav />
      <Link href="/pages" className="ss-flow-back"><ChevronLeft size={14} /> Pages</Link>
      <section className="overflow-hidden rounded-[24px] border border-[rgba(var(--line-rgb),0.08)] bg-[var(--surface)] shadow-2xl">
        <div className="relative h-40 overflow-hidden bg-[var(--surface)] sm:h-52">
          {page.banner_url && <SafeImage src={page.banner_url} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-transparent to-transparent" />
        </div>
        <div className="px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="relative z-10 -mt-11 flex items-end justify-between gap-3">
            <div className="grid h-[88px] w-[88px] shrink-0 place-items-center overflow-hidden rounded-[24px] border-4 border-[var(--surface)] bg-[var(--surface-2)] text-4xl shadow-xl"><SafeImage src={page.avatar_url} alt="" className="h-full w-full object-cover" fallback={page.emoji ?? '⭐'} /></div>
            <div className="flex gap-2 pb-1">
              {isOwner && <Link href={`/pages/${slug}/settings`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[rgba(var(--line-rgb),0.1)] bg-[rgba(var(--contrast-rgb),0.04)] px-4 text-xs font-semibold text-[var(--text-1)] hover:bg-[rgba(var(--contrast-rgb),0.08)]"><Settings2 size={14} /> Manage</Link>}
              {user && !isOwner && <PageFollowButton userId={user.id} pageId={page.id} initialFollowing={Boolean(follow)} />}
              {!user && <Link href={`/auth/login?next=/pages/${slug}`} className="inline-flex h-10 items-center rounded-xl bg-[var(--accent-fill)] px-4 text-xs font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-fill)]">Follow</Link>}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-[-.035em] text-[var(--text-1)]">{page.name}</h1>{page.is_verified && <BadgeCheck size={18} className="text-[var(--blue)]" aria-label="Verified" />}</div>
          {page.category && <p className="mt-1 text-[12px] font-semibold uppercase tracking-widest text-[var(--accent)]">{page.category}</p>}
          {page.description && <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-2)]">{page.description}</p>}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-[var(--text-3)]"><span className="flex items-center gap-1.5"><Users size={13} /><strong className="text-[var(--text-1)]">{page.follower_count ?? 0}</strong> followers</span><span className="flex items-center gap-1.5"><Calendar size={13} />Joined {new Date(page.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span></div>
        </div>
      </section>

      <section className="mt-4 grid min-w-0 grid-cols-1 gap-3">
        {isOwner && <FeedComposer pageId={page.id} />}
        {!posts.length ? <div className="rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[rgba(var(--contrast-rgb),0.025)] py-16 text-center"><p className="font-semibold text-[var(--text-2)]">No posts yet</p></div> : posts.map((post: any) => <PostCardClient key={post.id} post={post} />)}
      </section>
    </ProductPageShell>
  )
}
