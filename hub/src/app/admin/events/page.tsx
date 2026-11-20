import { createClient } from '@/lib/supabase/server'
import { AdminDeleteRowAction } from '@/components/admin/AdminDeleteRowAction'

export const dynamic = 'force-dynamic'

export default async function AdminEventsPage() {
  const supabase = await createClient()
  const { data: events } = await supabase
    .from('events')
    .select('id, title, sport, location, is_online, start_date, end_date, going_count, interested_count, created_at, host:users(username, display_name)')
    .order('start_date', { ascending: false })
    .limit(100)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-6">Manage Events</h1>
      {(events?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-[var(--text-3)] text-sm">No events yet</div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)]">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Event</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Host</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">When</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Where</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">RSVPs</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {(events ?? []).map((e: any) => (
                <tr key={e.id} className="hover:bg-[color-mix(in_srgb,var(--surface-2)_40%,transparent)] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--text-1)]">{e.title}</p>
                    {e.sport && <span className="text-[12px] font-bold bg-[var(--surface-2)] text-[var(--text-2)] px-2 py-0.5 rounded-full mt-1 inline-block">{e.sport}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-2)]">@{e.host?.username}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-3)]">{e.start_date ? new Date(e.start_date).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-3)]">{e.is_online ? 'Online' : (e.location || '—')}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-3)]">✓ {e.going_count ?? 0} · ★ {e.interested_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <AdminDeleteRowAction table="events" id={e.id} confirmLabel="this event" />
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
