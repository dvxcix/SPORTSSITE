import { createClient } from '@/lib/supabase/server'
import { AdminDeleteRowAction } from '@/components/admin/AdminDeleteRowAction'

export const dynamic = 'force-dynamic'

export default async function AdminStoriesPage() {
  const supabase = await createClient()
  const { data: stories } = await supabase
    .from('stories')
    .select('id, media_url, media_type, caption, content, sport, story_type, view_count, expires_at, created_at, author:users(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-black text-white mb-6">Manage Stories</h1>
      {(stories?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-zinc-500 text-sm">No stories yet</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Author</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Content</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Type</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Views</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Expires</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(stories ?? []).map((s: any) => {
                const expired = s.expires_at && new Date(s.expires_at) < new Date()
                return (
                  <tr key={s.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-zinc-400">@{s.author?.username}</td>
                    <td className="px-4 py-3 max-w-xs">
                      {s.media_url ? (
                        <div className="flex items-center gap-2">
                          {s.media_type === 'image' ? (
                            <img src={s.media_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                          ) : (
                            <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded shrink-0">{s.media_type}</span>
                          )}
                          <p className="text-xs text-zinc-400 line-clamp-2">{s.caption}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400 line-clamp-2">{s.content}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                        {s.story_type || 'media'}{s.sport ? ` · ${s.sport}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{s.view_count ?? 0}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={expired ? 'text-zinc-600' : 'text-green-400'}>
                        {expired ? 'Expired' : s.expires_at ? new Date(s.expires_at).toLocaleString() : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <AdminDeleteRowAction table="stories" id={s.id} confirmLabel="this story" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
