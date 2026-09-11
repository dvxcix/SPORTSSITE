import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, BookOpen, Clock, Eye, Pencil } from 'lucide-react'
import { BlogLikeButton } from '@/components/blog/BlogLikeButton'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductPageShell, ProductPanel, ProductSectionHeader } from '@/components/product/ProductPage'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { sportLogoUrl } from '@/lib/sportLogos'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: blog } = await supabase.from('blogs').select('title, excerpt, cover_image').eq('slug', slug).eq('status', 'published').single()
  if (!blog) return {}
  const description = blog.excerpt || blog.title
  return { title: `${blog.title} · SlipSurge`, description, openGraph: { title: blog.title, description, images: blog.cover_image ? [blog.cover_image] : undefined }, twitter: { card: 'summary_large_image', title: blog.title, description, images: blog.cover_image ? [blog.cover_image] : undefined } }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const [{ data: { user } }, { data: blog }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('blogs').select('*, author:users(id, username, display_name, avatar_url, is_verified, bio, account_type)').eq('slug', slug).eq('status', 'published').single(),
  ])
  if (!blog) notFound()

  const admin = createAdminClient()
  const [viewResult, relatedResult, likedResult] = await Promise.all([
    admin.rpc('record_blog_view', { p_blog_id: blog.id }),
    supabase.from('blogs').select('id, title, slug, cover_image, excerpt, created_at, author:users(username, display_name)').eq('status', 'published').neq('id', blog.id).eq('category', blog.category ?? '').limit(3),
    user ? supabase.from('blog_likes').select('blog_id').eq('blog_id', blog.id).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const displayedViewCount = typeof viewResult.data === 'number' ? viewResult.data : (blog.view_count ?? 0)
  const related = relatedResult.data ?? []
  const authorName = blog.author?.display_name || blog.author?.username || 'SlipSurge member'
  const isOwner = user?.id === blog.author_id

  return <ProductPageShell narrow>
    <CommunityNav />
    <Link href="/blog" className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 transition hover:text-white"><ArrowLeft size={13} /> Articles</Link>
    <article className="overflow-hidden rounded-[26px] border border-white/[.08] bg-gradient-to-br from-white/[.045] to-white/[.015] shadow-[0_28px_90px_rgba(0,0,0,.3)]">
      <div className="relative min-h-56 overflow-hidden bg-[radial-gradient(circle_at_20%_15%,rgba(163,230,53,.2),transparent_38%),#101510] sm:min-h-80">
        {blog.cover_image ? <img src={blog.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <BookOpen size={64} className="absolute bottom-7 left-7 text-lime-300/30" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      </div>
      <div className="p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          {blog.category && <span className="rounded-full border border-lime-400/20 bg-lime-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.16em] text-lime-300">{blog.category}</span>}
          {blog.sport && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[.07] bg-white/[.035] px-2.5 py-1 text-[9px] font-black uppercase tracking-[.14em] text-zinc-300">{sportLogoUrl(blog.sport) && <img src={sportLogoUrl(blog.sport)} alt="" className="h-3.5 w-3.5 object-contain" />}{blog.sport}</span>}
        </div>
        <h1 className="mt-4 text-3xl font-black leading-[1.04] tracking-[-.045em] text-white sm:text-5xl">{blog.title}</h1>
        {blog.excerpt && <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">{blog.excerpt}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/[.07] pt-5">
          <Link href={`/profile/${blog.author?.username}`} className="flex min-w-0 items-center gap-3 transition hover:opacity-80"><MemberAvatar src={blog.author?.avatar_url} name={authorName} size={42} /><span className="min-w-0"><strong className="block truncate text-sm text-white">{authorName}{blog.author?.is_verified && <span className="ml-1 text-lime-300">✓</span>}</strong><small className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500"><span className="flex items-center gap-1"><Clock size={10} />{new Date(blog.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span><span className="flex items-center gap-1"><Eye size={10} />{displayedViewCount}</span></small></span></Link>
          <div className="ml-auto flex items-center gap-2">{user && <BlogLikeButton blogId={blog.id} likes={blog.like_count ?? 0} initialLiked={Boolean(likedResult.data)} />}{isOwner && <Link href={`/blog/edit/${blog.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-300 transition hover:border-lime-400/25 hover:text-white"><Pencil size={12} /> Edit</Link>}</div>
        </div>
        <div className="prose prose-invert prose-sm mt-8 max-w-none text-zinc-300 prose-headings:tracking-[-.03em] prose-p:leading-7">
          {(blog.content ?? '').split('\n').map((paragraph: string, index: number) => paragraph.startsWith('## ') ? <h2 key={index}>{paragraph.slice(3)}</h2> : paragraph.startsWith('# ') ? <h1 key={index}>{paragraph.slice(2)}</h1> : paragraph.startsWith('### ') ? <h3 key={index}>{paragraph.slice(4)}</h3> : paragraph.trim() === '' ? <div key={index} className="h-2" /> : <p key={index}>{paragraph}</p>)}
        </div>
      </div>
    </article>

    {blog.author?.bio && <ProductPanel padded><div className="flex items-start gap-4"><MemberAvatar src={blog.author.avatar_url} name={authorName} size={52} tone="creator" /><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.16em] text-lime-300">About the author</p><Link href={`/profile/${blog.author.username}`} className="mt-1 block font-black text-white hover:text-lime-200">{authorName}</Link><p className="mt-1 text-sm leading-6 text-zinc-400">{blog.author.bio}</p></div></div></ProductPanel>}

    {related.length > 0 && <section><ProductSectionHeader title="Keep reading" /><div className="grid gap-3">{related.map((item: any) => <Link key={item.id} href={`/blog/${item.slug}`} className="group grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.025] p-3 transition hover:border-lime-400/25 hover:bg-white/[.04]">{item.cover_image ? <img src={item.cover_image} alt="" className="h-16 w-[76px] rounded-xl object-cover" /> : <span className="grid h-16 w-[76px] place-items-center rounded-xl bg-lime-400/[.07] text-lime-300/40"><BookOpen size={24} /></span>}<span className="min-w-0"><strong className="line-clamp-2 text-sm leading-snug text-white">{item.title}</strong>{item.excerpt && <small className="mt-1 block truncate text-zinc-500">{item.excerpt}</small>}</span><ArrowRight size={14} className="text-zinc-600 transition group-hover:translate-x-1 group-hover:text-lime-300" /></Link>)}</div></section>}
  </ProductPageShell>
}
