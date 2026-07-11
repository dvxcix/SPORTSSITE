import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { BookOpen, Plus, Clock, Eye } from 'lucide-react'

export const revalidate = 60

export default async function BlogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: blogs } = await supabase
    .from('blogs')
    .select('*, author:users(username, display_name, avatar_url, is_verified)')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg"><BookOpen size={20} className="text-purple-400" /></div>
          <div>
            <h1 className="text-xl font-black text-white">Blog</h1>
            <p className="text-xs text-zinc-500">Long-form takes, analysis & breakdowns</p>
          </div>
        </div>
        {user && (
          <div className="flex gap-2">
            <Link href="/blog/create/ai"
              className="flex items-center gap-1.5 border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 text-xs font-black px-3 py-2 rounded-lg transition-colors">
              ✨ AI Write
            </Link>
            <Link href="/blog/create"
              className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors">
              <Plus size={14} /> Write
            </Link>
          </div>
        )}
      </div>

      {(blogs?.length ?? 0) === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-zinc-400 font-medium">No articles yet</p>
          {user && <Link href="/blog/create" className="inline-flex items-center gap-2 mt-4 bg-green-500 hover:bg-green-400 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors"><Plus size={14} /> Write the first one</Link>}
        </div>
      ) : (
        <div className="space-y-4">
          {(blogs ?? []).map((b: any) => (
            <Link key={b.id} href={`/blog/${b.slug}`}
              className="block bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-all overflow-hidden">
              {b.cover_image && (
                <div className="h-48 overflow-hidden">
                  <img src={b.cover_image} alt={b.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4">
                {b.category && <span className="text-[10px] font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full">{b.category}</span>}
                <h2 className="text-lg font-black text-white mt-2 leading-tight">{b.title}</h2>
                {b.excerpt && <p className="text-sm text-zinc-400 mt-1.5 line-clamp-2">{b.excerpt}</p>}
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-zinc-700 overflow-hidden shrink-0">
                      {b.author?.avatar_url && <img src={b.author.avatar_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <span className="text-xs font-medium text-zinc-400">{b.author?.display_name || b.author?.username}</span>
                    {b.author?.is_verified && <span className="text-green-400 text-xs">✓</span>}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-zinc-600">
                    <Clock size={10} /> {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  {b.view_count > 0 && (
                    <span className="flex items-center gap-1 text-xs text-zinc-600">
                      <Eye size={10} /> {b.view_count}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
