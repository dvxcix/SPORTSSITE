import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Clock, Eye, Heart, ArrowLeft, BookOpen } from 'lucide-react'
import { BlogLikeButton } from '@/components/blog/BlogLikeButton'
import { sportLogoUrl } from '@/lib/sportLogos'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: blog } = await supabase.from('blogs').select('title, excerpt, cover_image').eq('slug', slug).eq('status', 'published').single()
  if (!blog) return {}
  const description = blog.excerpt || blog.title
  return {
    title: `${blog.title} · SlipSurge`,
    description,
    openGraph: { title: blog.title, description, images: blog.cover_image ? [blog.cover_image] : undefined },
    twitter: { card: 'summary_large_image', title: blog.title, description, images: blog.cover_image ? [blog.cover_image] : undefined },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: blog } = await supabase
    .from('blogs')
    .select('*, author:users(id, username, display_name, avatar_url, is_verified, bio, account_type)')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!blog) notFound()

  // Increment view count
  await supabase.from('blogs').update({ view_count: (blog.view_count ?? 0) + 1 }).eq('id', blog.id)

  // Related posts
  const { data: related } = await supabase
    .from('blogs')
    .select('id, title, slug, cover_image, excerpt, created_at, author:users(username, display_name)')
    .eq('status', 'published')
    .neq('id', blog.id)
    .eq('category', blog.category ?? '')
    .limit(3)

  const isOwner = user?.id === blog.author_id

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link href="/blog" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 mb-6 transition-colors">
        <ArrowLeft size={12} /> Back to Blog
      </Link>

      {blog.cover_image && (
        <div className="h-64 rounded-2xl overflow-hidden mb-6">
          <img src={blog.cover_image} alt={blog.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {blog.category && (
          <span className="text-xs font-bold text-purple-400 bg-purple-400/10 px-2.5 py-1 rounded-full">{blog.category}</span>
        )}
        {blog.sport && (
          sportLogoUrl(blog.sport) ? (
            <span className="bg-blue-400/10 rounded-full p-1.5 flex items-center"><img src={sportLogoUrl(blog.sport)} alt={blog.sport} className="w-4 h-4 object-contain" /></span>
          ) : (
            <span className="text-xs font-bold text-blue-400 bg-blue-400/10 px-2.5 py-1 rounded-full">{blog.sport}</span>
          )
        )}
      </div>

      <h1 className="text-3xl font-black text-white leading-tight mb-3">{blog.title}</h1>
      {blog.excerpt && <p className="text-lg text-zinc-400 mb-6 leading-relaxed">{blog.excerpt}</p>}

      {/* Author + meta */}
      <div className="flex items-center justify-between mb-6 pb-6 border-b border-zinc-800">
        <Link href={`/profile/${blog.author?.username}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
            {blog.author?.avatar_url && <img src={blog.author.avatar_url} alt="" className="w-full h-full object-cover" />}
          </div>
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-1">
              {blog.author?.display_name || blog.author?.username}
              {blog.author?.is_verified && <span className="text-green-400">✓</span>}
            </p>
            <p className="text-xs text-zinc-500 flex items-center gap-2">
              <Clock size={10} /> {new Date(blog.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              <Eye size={10} /> {blog.view_count ?? 0} views
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {user && <BlogLikeButton userId={user.id} blogId={blog.id} likes={blog.like_count ?? 0} />}
          {isOwner && (
            <Link href={`/blog/edit/${blog.id}`}
              className="text-xs font-bold text-zinc-400 border border-zinc-700 hover:border-zinc-600 px-3 py-1.5 rounded-lg transition-colors">
              Edit
            </Link>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed">
        {(blog.content ?? '').split('\n').map((p: string, i: number) => (
          p.startsWith('## ') ? <h2 key={i} className="text-xl font-black text-white mt-8 mb-3">{p.slice(3)}</h2> :
          p.startsWith('# ')  ? <h1 key={i} className="text-2xl font-black text-white mt-8 mb-4">{p.slice(2)}</h1> :
          p.startsWith('### ') ? <h3 key={i} className="text-lg font-bold text-white mt-6 mb-2">{p.slice(4)}</h3> :
          p.trim() === '' ? <div key={i} className="h-3" /> :
          <p key={i} className="mb-4 text-zinc-300 leading-relaxed">{p}</p>
        ))}
      </div>

      {/* Author bio box */}
      {blog.author?.bio && (
        <div className="mt-10 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs font-bold text-zinc-500 mb-3">ABOUT THE AUTHOR</p>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-zinc-700 overflow-hidden shrink-0">
              {blog.author?.avatar_url && <img src={blog.author.avatar_url} alt="" className="w-full h-full object-cover" />}
            </div>
            <div>
              <p className="font-bold text-white">{blog.author?.display_name || blog.author?.username}</p>
              <p className="text-sm text-zinc-400 mt-1">{blog.author.bio}</p>
            </div>
          </div>
        </div>
      )}

      {/* Related */}
      {(related?.length ?? 0) > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <BookOpen size={14} /> Related Articles
          </h2>
          <div className="space-y-3">
            {(related ?? []).map((r: any) => (
              <Link key={r.id} href={`/blog/${r.slug}`}
                className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-all">
                {r.cover_image && (
                  <div className="w-20 h-16 rounded-lg overflow-hidden shrink-0">
                    <img src={r.cover_image} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <p className="font-bold text-white text-sm leading-snug">{r.title}</p>
                  {r.excerpt && <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{r.excerpt}</p>}
                  <p className="text-xs text-zinc-600 mt-1">by {r.author?.display_name || r.author?.username}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
