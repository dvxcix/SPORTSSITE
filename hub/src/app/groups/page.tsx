import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, Plus, Lock } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'

export const revalidate = 60

export default async function GroupsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: groups } = await supabase
    .from('groups')
    .select('*')
    .eq('is_public', true)
    .order('member_count', { ascending: false })
    .limit(30)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg"><Users size={20} className="text-purple-400" /></div>
          <div>
            <h1 className="text-xl font-black text-white">Groups</h1>
            <p className="text-xs text-zinc-500">Join sports communities</p>
          </div>
        </div>
        {user && (
          <Link href="/groups/create"
            className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Create Group
          </Link>
        )}
      </div>

      {!groups || groups.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-zinc-400 font-medium">No groups yet</p>
          {user && (
            <Link href="/groups/create"
              className="inline-flex items-center gap-2 mt-4 bg-green-500 hover:bg-green-400 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors">
              <Plus size={14} /> Be the first to create one
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {groups.map((g: any) => (
            <Link key={g.id} href={`/groups/${g.slug}`}
              className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all">
              <div className="w-12 h-12 rounded-xl bg-zinc-700 flex items-center justify-center text-2xl shrink-0 overflow-hidden">
                {g.avatar_url ? <img src={g.avatar_url} alt="" className="w-full h-full object-cover" /> : g.emoji ?? '👥'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-white">{g.name}</p>
                  {!g.is_public && <Lock size={12} className="text-zinc-500" />}
                  {g.sport && (
                    sportLogoUrl(g.sport)
                      ? <img src={sportLogoUrl(g.sport)} alt={g.sport} className="w-3.5 h-3.5 object-contain" />
                      : <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">{g.sport}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{g.description}</p>
                <p className="text-xs text-zinc-600 mt-1">{g.member_count ?? 0} members</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
