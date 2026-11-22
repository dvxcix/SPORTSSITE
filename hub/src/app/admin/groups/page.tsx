import { creatorAdminAuth } from '@/lib/creatorAdminAuth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AdminDeleteRowAction } from '@/components/admin/AdminDeleteRowAction'
import { SafeImage } from '@/components/ui/SafeImage'

export const dynamic = 'force-dynamic'

export default async function AdminGroupsPage({searchParams}:{searchParams:Promise<{owner?:string}>}) {
  const auth=await creatorAdminAuth()
  if('error' in auth)redirect(auth.status===401?'/auth/login':'/settings/security')
  const {owner}=await searchParams
  let query = auth.admin
    .from('groups')
    .select('id, name, slug, owner_id, sport, emoji, avatar_url, is_public, access_type, member_count, created_at, owner:users(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(100)
  if(owner&&/^[0-9a-f-]{36}$/i.test(owner))query=query.eq('owner_id',owner)
  const {data:groups,error}=await query
  if(error)throw new Error('Communities could not be loaded.')

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold text-[var(--text-1)]">Manage communities</h1><p className="mt-2 text-sm text-[var(--text-2)]">Public, private and paid groups. Showing the latest 100{owner?' for this owner':''}.</p></div><Link href="/admin/creators" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 text-sm">Creator operations</Link>{owner&&<Link href="/admin/groups" className="inline-flex min-h-11 items-center text-sm text-[var(--accent)]">All communities</Link>}</header>
      {(groups?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-[var(--text-3)] text-sm">No groups yet</div>
      ) : (
        <div className="ss-table-region ss-admin-table-region bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-x-auto" role="region" aria-label="Groups table" tabIndex={0}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)]">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Group</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Owner</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Sport</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Visibility</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Members</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {(groups ?? []).map((g: any) => (
                <tr key={g.id} className="hover:bg-[color-mix(in_srgb,var(--surface-2)_40%,transparent)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-sm overflow-hidden shrink-0">
                        {g.avatar_url ? <SafeImage src={g.avatar_url} alt="" className="w-full h-full object-cover" /> : (g.emoji || g.name?.[0] || '?')}
                      </div>
                      <Link href={`/groups/${g.slug}`} className="font-medium text-[var(--text-1)]">{g.name}</Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-2)]"><Link href={`/profile/${g.owner?.username}`}>@{g.owner?.username}</Link></td>
                  <td className="px-4 py-3 text-xs text-[var(--text-3)]">{g.sport || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${g.is_public ? 'bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-[var(--green)]' : 'bg-[var(--surface-2)] text-[var(--text-2)]'}`}>
                      {g.access_type==='paid'?'Paid':g.is_public ? 'Free · public' : 'Free · private'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-3)]">{g.member_count ?? 0}</td>
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
