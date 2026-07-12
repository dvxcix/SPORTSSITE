import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { MessageSquare, Plus, Pin } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'

export const revalidate = 60

export default async function ForumPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: categories } = await supabase
    .from('forum_categories')
    .select('*')
    .order('sort_order', { ascending: true })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg"><MessageSquare size={20} className="text-orange-400" /></div>
          <div>
            <h1 className="text-xl font-black text-white">Forum</h1>
            <p className="text-xs text-zinc-500">Threads, debates & pick discussions</p>
          </div>
        </div>
        {user && (
          <Link href="/forum/new"
            className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors">
            <Plus size={14} /> New Thread
          </Link>
        )}
      </div>

      <div className="space-y-2">
        {(categories ?? []).map((cat: any) => (
          <Link key={cat.id} href={`/forum/${cat.slug}`}
            className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl shrink-0">
              {cat.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-white">{cat.name}</p>
                {cat.sport && (
                  sportLogoUrl(cat.sport)
                    ? <img src={sportLogoUrl(cat.sport)} alt={cat.sport} className="w-3.5 h-3.5 object-contain" />
                    : <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">{cat.sport}</span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{cat.description}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-white">{cat.thread_count ?? 0}</p>
              <p className="text-xs text-zinc-600">threads</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
