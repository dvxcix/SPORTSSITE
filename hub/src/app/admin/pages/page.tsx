import { createClient } from '@/lib/supabase/server'
import { AdminPageActions } from '@/components/admin/AdminPageActions'
import { LayoutGrid } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminPagesPage() {
  const supabase = await createClient()
  const { data: pages } = await supabase
    .from('pages')
    .select('*, owner:users(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <LayoutGrid size={20} className="text-[var(--blue)]" />
        <h1 className="text-xl font-semibold text-[var(--text-1)]">Pages</h1>
        <span className="text-xs text-[var(--text-3)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full">{pages?.length ?? 0}</span>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)]">
            <tr>{['Page', 'Category', 'Followers', 'Owner', 'Status', 'Actions'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-bold text-[var(--text-3)] uppercase tracking-wider">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {(pages ?? []).map((p: any) => (
              <tr key={p.id} className="hover:bg-[color-mix(in_srgb,var(--surface-2)_50%,transparent)] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.emoji ?? '⭐'}</span>
                    <div>
                      <p className="font-bold text-[var(--text-1)]">{p.name}</p>
                      <p className="text-xs text-[var(--text-3)]">/{p.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--text-2)]">{p.category ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--text-2)]">{p.follower_count ?? 0}</td>
                <td className="px-4 py-3 text-[var(--text-2)]">@{p.owner?.username}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.is_published ? 'text-[var(--green)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)]' : 'text-[var(--text-3)] bg-[var(--surface-2)]'}`}>
                    {p.is_published ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="px-4 py-3"><AdminPageActions pageId={p.id} isVerified={p.is_verified} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
