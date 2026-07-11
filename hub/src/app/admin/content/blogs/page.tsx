import { createClient } from '@/lib/supabase/server'
import { AdminDeleteRowAction } from '@/components/admin/AdminDeleteRowAction'

export const dynamic = 'force-dynamic'

export default async function AdminBlogsPage() {
  const supabase = await createClient()
  const { data: blogs } = await supabase
    .from('blogs')
    .select('id, title, slug, category, sport, status, view_count, like_count, created_at, author:users(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-black text-white mb-6">Manage Blogs</h1>
      {(blogs?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-zinc-500 text-sm">No blog posts yet</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Title</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Author</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Category</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Engagement</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Date</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(blogs ?? []).map((b: any) => (
                <tr key={b.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-white max-w-xs">
                    <p className="line-clamp-2">{b.title}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">@{b.author?.username}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                      {b.category || '—'}{b.sport ? ` · ${b.sport}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      b.status === 'published' ? 'bg-green-500/10 text-green-400' :
                      b.status === 'draft' ? 'bg-zinc-800 text-zinc-400' :
                      'bg-yellow-500/10 text-yellow-400'
                    }`}>{b.status || 'draft'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">👁 {b.view_count ?? 0} · ❤️ {b.like_count ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{new Date(b.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <AdminDeleteRowAction table="blogs" id={b.id} confirmLabel="this blog post" />
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
