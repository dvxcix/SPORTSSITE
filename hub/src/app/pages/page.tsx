import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Star, Plus, Lock, Users } from 'lucide-react'

export const revalidate = 60

export default async function PagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: pages } = await supabase
    .from('pages')
    .select('*')
    .eq('is_published', true)
    .order('follower_count', { ascending: false })
    .limit(40)

  const CATEGORIES = ['All', 'Team', 'Athlete', 'Media', 'Brand', 'Community', 'Podcast']

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg"><Star size={20} className="text-yellow-400" /></div>
          <div>
            <h1 className="text-xl font-black text-white">Pages</h1>
            <p className="text-xs text-zinc-500">Teams, athletes, brands & communities</p>
          </div>
        </div>
        {user && (
          <Link href="/pages/create"
            className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Create Page
          </Link>
        )}
      </div>

      {/* Category pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {CATEGORIES.map(c => (
          <button key={c}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-xs font-bold text-zinc-400 hover:border-green-500/50 hover:text-white transition-all whitespace-nowrap shrink-0">
            {c}
          </button>
        ))}
      </div>

      {!pages || pages.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">⭐</p>
          <p className="text-zinc-400 font-medium">No pages yet</p>
          {user && (
            <Link href="/pages/create"
              className="inline-flex items-center gap-2 mt-4 bg-green-500 hover:bg-green-400 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors">
              <Plus size={14} /> Create the first page
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {pages.map((p: any) => (
            <Link key={p.id} href={`/pages/${p.slug}`}
              className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all">
              <div className="w-14 h-14 rounded-xl bg-zinc-700 shrink-0 flex items-center justify-center text-2xl overflow-hidden">
                {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" /> : p.emoji ?? '⭐'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-white truncate">{p.name}</p>
                  {p.is_verified && <span className="text-green-400 text-xs shrink-0">✓</span>}
                  {p.category && (
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full shrink-0">{p.category}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{p.description}</p>
                <p className="text-xs text-zinc-600 mt-1 flex items-center gap-1">
                  <Users size={10} /> {p.follower_count ?? 0} followers
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
