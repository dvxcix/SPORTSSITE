import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Edit, Eye, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function MyBlogsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/blog/my')

  const { data: blogs } = await supabase
    .from('blogs')
    .select('id, title, slug, status, view_count, like_count, created_at, excerpt, cover_image, category')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-black text-white">My Articles</h1>
        <div className="flex gap-2">
          <Link href="/blog/create/ai" className="text-xs font-black border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 px-3 py-2 rounded-lg transition-colors">✨ AI Write</Link>
          <Link href="/blog/create" className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors"><Plus size={14} /> Write</Link>
        </div>
      </div>

      {(blogs?.length ?? 0) === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-zinc-400">You haven't written any articles yet</p>
          <Link href="/blog/create" className="inline-flex items-center gap-2 mt-4 bg-green-500 hover:bg-green-400 text-black text-sm font-bold px-4 py-2 rounded-xl transition-colors"><Plus size={14} /> Start writing</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(blogs ?? []).map((b: any) => (
            <div key={b.id} className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              {b.cover_image && (
                <div className="w-20 h-16 rounded-lg overflow-hidden shrink-0">
                  <img src={b.cover_image} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-white leading-tight truncate">{b.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${b.status === 'published' ? 'text-green-400 bg-green-400/10' : 'text-zinc-500 bg-zinc-800'}`}>
                        {b.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                      {b.category && <span className="text-[10px] text-zinc-600">{b.category}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Link href={b.status === 'published' ? `/blog/${b.slug}` : `/blog/create`}
                      className="p-1.5 text-zinc-500 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-all">
                      {b.status === 'published' ? <Eye size={13} /> : <Edit size={13} />}
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="flex items-center gap-1 text-xs text-zinc-600"><Eye size={10} /> {b.view_count ?? 0}</span>
                  <span className="flex items-center gap-1 text-xs text-zinc-600"><Clock size={10} /> {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
