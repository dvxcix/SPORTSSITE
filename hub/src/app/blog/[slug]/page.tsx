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
import { SafeImage } from '@/components/ui/SafeImage'

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
    supabase.from('blogs').select('*, author:users(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, is_verified, bio, account_type)').eq('slug', slug).eq('status', 'published').single(),
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
    <Link href="/blog" className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-3)] transition hover:text-[var(--text-1)]"><ArrowLeft size={13} /> Articles</Link>
    <article className="ss-article overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      {blog.cover_image && <div className="relative aspect-[16/7] overflow-hidden bg-[var(--surface-2)]"><SafeImage src={blog.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover" /></div>}
      <div className="p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          {blog.category && <span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2.5 py-1 text-[11px] font-semibold tracking-normal text-[var(--accent)]">{blog.category}</span>}
          {blog.sport && <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(var(--line-rgb),0.07)] bg-[rgba(var(--contrast-rgb),0.035)] px-2.5 py-1 text-[11px] font-semibold tracking-normal text-[var(--text-2)]">{sportLogoUrl(blog.sport) && <SafeImage src={sportLogoUrl(blog.sport)} alt="" className="h-3.5 w-3.5 object-contain" />}{blog.sport}</span>}
        </div>
        <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-[-.025em] text-[var(--text-1)] sm:text-[34px]">{blog.title}</h1>
        {blog.excerpt && <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-2)] sm:text-lg">{blog.excerpt}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[rgba(var(--line-rgb),0.07)] pt-5">
          <Link href={`/profile/${blog.author?.username}`} className="flex min-w-0 items-center gap-3 transition hover:opacity-80"><MemberAvatar src={blog.author?.avatar_url} name={authorName} size={42} ringStyle={blog.author?.avatar_ring_style} ringColor={blog.author?.avatar_ring_color} /><span className="min-w-0"><strong className="block truncate text-sm text-[var(--text-1)]">{authorName}{blog.author?.is_verified && <span className="ml-1 text-[var(--accent)]">✓</span>}</strong><small className="mt-0.5 flex items-center gap-2 text-[12px] text-[var(--text-3)]"><span className="flex items-center gap-1"><Clock size={10} />{new Date(blog.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span><span className="flex items-center gap-1"><Eye size={10} />{displayedViewCount}</span></small></span></Link>
          <div className="ml-auto flex items-center gap-2">{user && <BlogLikeButton blogId={blog.id} likes={blog.like_count ?? 0} initialLiked={Boolean(likedResult.data)} />}{isOwner && <Link href={`/blog/edit/${blog.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(var(--line-rgb),0.1)] px-3 py-1.5 text-xs font-bold text-[var(--text-2)] transition hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:text-[var(--text-1)]"><Pencil size={12} /> Edit</Link>}</div>
        </div>
        <div className="ss-article-body prose prose-sm mt-8 max-w-none text-[var(--text-2)] prose-headings:tracking-[-.03em] prose-p:leading-7">
          {(blog.content ?? '').split('\n').map((paragraph: string, index: number) => paragraph.startsWith('## ') ? <h3 key={index}>{paragraph.slice(3)}</h3> : paragraph.startsWith('# ') ? <h2 key={index}>{paragraph.slice(2)}</h2> : paragraph.startsWith('### ') ? <h4 key={index}>{paragraph.slice(4)}</h4> : paragraph.trim() === '' ? <div key={index} className="h-2" /> : <p key={index}>{paragraph}</p>)}
        </div>
      </div>
    </article>

    {blog.author?.bio && <ProductPanel padded><div className="flex items-start gap-4"><MemberAvatar src={blog.author.avatar_url} name={authorName} size={52} tone="creator" ringStyle={blog.author.avatar_ring_style} ringColor={blog.author.avatar_ring_color} /><div className="min-w-0"><p className="text-[11px] font-semibold tracking-normal text-[var(--accent)]">About the author</p><Link href={`/profile/${blog.author.username}`} className="mt-1 block font-semibold text-[var(--text-1)] hover:text-[var(--accent)]">{authorName}</Link><p className="mt-1 text-sm leading-6 text-[var(--text-2)]">{blog.author.bio}</p></div></div></ProductPanel>}

    {related.length > 0 && <section><ProductSectionHeader title="Keep reading" /><div className="grid gap-3">{related.map((item: any) => <Link key={item.id} href={`/blog/${item.slug}`} className="group grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[rgba(var(--contrast-rgb),0.025)] p-3 transition hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:bg-[rgba(var(--contrast-rgb),0.04)]">{item.cover_image ? <SafeImage src={item.cover_image} alt="" className="h-16 w-[76px] rounded-xl object-cover" /> : <span className="grid h-16 w-[76px] place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_7.000000000000001%,transparent)] text-[color-mix(in_srgb,var(--accent)_40%,transparent)]"><BookOpen size={24} /></span>}<span className="min-w-0"><strong className="line-clamp-2 text-sm leading-snug text-[var(--text-1)]">{item.title}</strong>{item.excerpt && <small className="mt-1 block truncate text-[var(--text-3)]">{item.excerpt}</small>}</span><ArrowRight size={14} className="text-[var(--text-3)] transition group-hover:translate-x-1 group-hover:text-[var(--accent)]" /></Link>)}</div></section>}
  </ProductPageShell>
}
