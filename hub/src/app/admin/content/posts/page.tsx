import { createClient } from '@/lib/supabase/server'
import { AdminPostActions } from '@/components/admin/AdminPostActions'

export const dynamic = 'force-dynamic'

export default async function AdminPostsPage() {
  const supabase = await createClient()
  const { data: posts } = await supabase
    .from('posts')
    .select('id, content, post_type, sport, visibility, reaction_count, comment_count, created_at, author:users(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-black text-white mb-6">Manage Posts</h1>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800">
            <tr className="text-left">
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Author</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Content</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Type</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Engagement</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Date</th>
              <th className="px-4 py-3 text-xs font-bold text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {(posts ?? []).map((p: any) => (
              <tr key={p.id} className="hover:bg-zinc-800/40 transition-colors">
                <td className="px-4 py-3 text-xs text-zinc-400">@{p.author?.username}</td>
                <td className="px-4 py-3 text-sm text-zinc-300 max-w-xs">
                  <p className="line-clamp-2">{p.content}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                    {p.post_type}{p.sport ? ` · ${p.sport}` : ''}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  ❤️ {p.reaction_count} · 💬 {p.comment_count}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <AdminPostActions postId={p.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
