import { createClient } from '@/lib/supabase/server'
import { AdminPostActions } from '@/components/admin/AdminPostActions'
import { Search } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const TYPES = ['text', 'pick', 'parlay', 'poll', 'analysis', 'reel']
const SORTS: Record<string, { column: string; ascending: boolean }> = {
  newest: { column: 'created_at', ascending: false },
  oldest: { column: 'created_at', ascending: true },
  most_liked: { column: 'reaction_count', ascending: false },
  most_commented: { column: 'comment_count', ascending: false },
}

export default async function AdminPostsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; type?: string; from?: string; to?: string; sort?: string }> }) {
  const { q, type, from, to, sort = 'newest' } = await searchParams
  const supabase = await createClient()

  // Author search needs a two-step lookup (not a single .or() across a
  // joined table) — search users by handle first, then filter posts by
  // those author_ids, since PostgREST can't .ilike() through an embed.
  let authorIds: string[] | null = null
  if (q) {
    const { data: matchedUsers } = await supabase
      .from('users').select('id')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    authorIds = (matchedUsers ?? []).map(u => u.id)
  }

  let query = supabase
    .from('posts')
    .select('id, content, post_type, sport, visibility, reaction_count, comment_count, repost_count, created_at, author:users(username, display_name)')
    .limit(100)

  if (q && authorIds) {
    const idList = authorIds.length ? authorIds.join(',') : '00000000-0000-0000-0000-000000000000'
    query = query.or(`content.ilike.%${q}%,author_id.in.(${idList})`)
  }
  if (type) query = query.eq('post_type', type)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', `${to}T23:59:59`)

  const { column, ascending } = SORTS[sort] ?? SORTS.newest
  query = query.order(column, { ascending })

  const { data: posts } = await query

  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const merged = { q, type, from, to, sort, ...overrides }
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v)
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-black text-white">Manage Posts</h1>
        <span className="text-sm text-zinc-500">{posts?.length ?? 0} results{(posts?.length ?? 0) === 100 ? ' (capped, narrow your filters)' : ''}</span>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Search</label>
          <Search size={14} className="absolute left-3 top-1/2 mt-1 -translate-y-1/2 text-zinc-500" />
          <input name="q" defaultValue={q} placeholder="Author or content…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">From</label>
          <input type="date" name="from" defaultValue={from}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-green-500/50" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">To</label>
          <input type="date" name="to" defaultValue={to}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-green-500/50" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Sort</label>
          <select name="sort" defaultValue={sort}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-green-500/50">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="most_liked">Most liked</option>
            <option value="most_commented">Most commented</option>
          </select>
        </div>
        {type && <input type="hidden" name="type" value={type} />}
        <button type="submit" className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
          Apply
        </button>
        {(q || from || to || type || sort !== 'newest') && (
          <Link href="/admin/content/posts" className="text-xs font-bold text-zinc-500 hover:text-white px-2 py-2">Clear</Link>
        )}
      </form>

      <div className="flex gap-1 mb-4">
        <Link href={qs({ type: undefined })}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!type ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60'}`}>
          All types
        </Link>
        {TYPES.map(t => (
          <Link key={t} href={qs({ type: t })}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${type === t ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60'}`}>
            {t}
          </Link>
        ))}
      </div>

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
            {(posts ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500 text-sm">No posts match these filters</td></tr>
            )}
            {(posts ?? []).map((p: any) => (
              <tr key={p.id} className="hover:bg-zinc-800/40 transition-colors">
                <td className="px-4 py-3 text-xs text-zinc-400">
                  {p.author?.username ? (
                    <Link href={`/profile/${p.author.username}`} className="hover:text-white hover:underline" target="_blank">@{p.author.username}</Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-300 max-w-xs">
                  <Link href={`/posts/${p.id}`} target="_blank" className="hover:underline">
                    <p className="line-clamp-2">{p.content || <span className="text-zinc-600 italic">(no text)</span>}</p>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                    {p.post_type}{p.sport ? ` · ${p.sport}` : ''}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  ❤️ {p.reaction_count} · 💬 {p.comment_count} · 🔁 {p.repost_count}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">{new Date(p.created_at).toLocaleString()}</td>
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
