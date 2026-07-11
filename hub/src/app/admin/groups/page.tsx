import { createClient } from '@/lib/supabase/server'
import { AdminDeleteRowAction } from '@/components/admin/AdminDeleteRowAction'

export const dynamic = 'force-dynamic'

export default async function AdminGroupsPage() {
  const supabase = await createClient()
  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, slug, sport, emoji, avatar_url, is_public, member_count, created_at, owner:users(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-black text-white mb-6">Manage Groups</h1>
      {(groups?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-zinc-500 text-sm">No groups yet</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Group</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Owner</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Sport</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Visibility</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Members</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(groups ?? []).map((g: any) => (
                <tr key={g.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm overflow-hidden shrink-0">
                        {g.avatar_url ? <img src={g.avatar_url} alt="" className="w-full h-full object-cover" /> : (g.emoji || g.name?.[0] || '?')}
                      </div>
                      <p className="font-medium text-white">{g.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">@{g.owner?.username}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{g.sport || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.is_public ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {g.is_public ? 'Public' : 'Private'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{g.member_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <AdminDeleteRowAction table="groups" id={g.id} confirmLabel="this group" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
