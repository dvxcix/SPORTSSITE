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
    supabase.from('posts').select('*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified, account_type, pick_record, tier, beta_access_active)').eq('page_id', page.id).order('created_at', { ascending: false }).limit(20),
  ])
  const posts = await attachUserReactions(rawPosts ?? [], user?.id)

  return (
    <ProductPageShell narrow>
      <CommunityNav />
      <Link href="/pages" className="ss-flow-back"><ChevronLeft size={14} /> Pages</Link>
      <section className="overflow-hidden rounded-[24px] border border-white/[.08] bg-[#0d100f] shadow-2xl">
        <div className="relative h-40 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(163,230,53,.18),transparent_42%),linear-gradient(135deg,#182016,#0b0d10)] sm:h-52">
          {page.banner_url && <img src={page.banner_url} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d100f] via-transparent to-transparent" />
        </div>
        <div className="px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="relative z-10 -mt-11 flex items-end justify-between gap-3">
            <div className="grid h-[88px] w-[88px] shrink-0 place-items-center overflow-hidden rounded-[24px] border-4 border-[#0d100f] bg-zinc-800 text-4xl shadow-xl">{page.avatar_url ? <img src={page.avatar_url} alt="" className="h-full w-full object-cover" /> : page.emoji ?? '⭐'}</div>
            <div className="flex gap-2 pb-1">
              {isOwner && <Link href={`/pages/${slug}/settings`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 text-xs font-black text-white hover:bg-white/[.08]"><Settings2 size={14} /> Manage</Link>}
              {user && !isOwner && <PageFollowButton userId={user.id} pageId={page.id} initialFollowing={Boolean(follow)} />}
              {!user && <Link href={`/auth/login?next=/pages/${slug}`} className="inline-flex h-10 items-center rounded-xl bg-lime-400 px-4 text-xs font-black text-black hover:bg-lime-300">Follow</Link>}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2"><h1 className="text-2xl font-black tracking-[-.035em] text-white">{page.name}</h1>{page.is_verified && <BadgeCheck size={18} className="text-sky-400" aria-label="Verified" />}</div>
          {page.category && <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-lime-300">{page.category}</p>}
          {page.description && <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{page.description}</p>}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-zinc-500"><span className="flex items-center gap-1.5"><Users size={13} /><strong className="text-white">{page.follower_count ?? 0}</strong> followers</span><span className="flex items-center gap-1.5"><Calendar size={13} />Joined {new Date(page.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span></div>
        </div>
      </section>

      <section className="mt-4 grid gap-3">
        {isOwner && <FeedComposer />}
        {!posts.length ? <div className="rounded-2xl border border-white/[.08] bg-white/[.025] py-16 text-center"><p className="font-black text-zinc-300">No posts yet</p></div> : posts.map((post: any) => <PostCardClient key={post.id} post={post} />)}
      </section>
    </ProductPageShell>
  )
}
