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
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-6">Manage Blogs</h1>
      {(blogs?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-[var(--text-3)] text-sm">No blog posts yet</div>
      ) : (
        <div className="ss-table-region ss-admin-table-region bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-x-auto" role="region" aria-label="Blog posts table" tabIndex={0}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)]">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Title</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Author</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Category</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Engagement</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Date</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {(blogs ?? []).map((b: any) => (
                <tr key={b.id} className="hover:bg-[color-mix(in_srgb,var(--surface-2)_40%,transparent)] transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-[var(--text-1)] max-w-xs">
                    <p className="line-clamp-2">{b.title}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-2)]">@{b.author?.username}</td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-bold bg-[var(--surface-2)] text-[var(--text-2)] px-2 py-0.5 rounded-full">
                      {b.category || '—'}{b.sport ? ` · ${b.sport}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${
                      b.status === 'published' ? 'bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-[var(--green)]' :
                      b.status === 'draft' ? 'bg-[var(--surface-2)] text-[var(--text-2)]' :
                      'bg-yellow-500/10 text-yellow-400'
                    }`}>{b.status || 'draft'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-3)]">👁 {b.view_count ?? 0} · ❤️ {b.like_count ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-3)]">{new Date(b.created_at).toLocaleDateString('en-US', {timeZone:'UTC'})}</td>
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
