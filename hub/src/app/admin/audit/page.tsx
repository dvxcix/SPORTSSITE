import Link from 'next/link'
import { ScrollText, Search, ShieldCheck } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type AuditRow = {
  id: number
  actor_user_id: string | null
  action: string
  target_type: string
  target_id: string | null
  details: Record<string, unknown> | null
  request_id: string | null
  ip_address: string | null
  created_at: string
  actor: { username: string | null; display_name: string | null } | null
}

export default async function AdminAuditPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; action?: string }> }) {
  const { q, action } = await searchParams
  const admin = createAdminClient()
  let query = admin
    .from('admin_audit_logs')
    .select('id,actor_user_id,action,target_type,target_id,details,request_id,ip_address,created_at,actor:users!admin_audit_logs_actor_user_id_fkey(username,display_name)')
    .order('created_at', { ascending: false })
    .limit(250)

  if (action) query = query.eq('action', action)
  if (q) query = query.or(`target_id.ilike.%${q}%,request_id.ilike.%${q}%,action.ilike.%${q}%`)
  const { data, error } = await query
  const rows = (data ?? []) as unknown as AuditRow[]
  const actions = Array.from(new Set(rows.map(row => row.action))).sort()

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]"><ShieldCheck size={14} /> Security</div>
          <h1 className="flex items-center gap-3 text-2xl font-black text-[var(--text-1)]"><ScrollText size={22} /> Audit log</h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">Immutable records of administrative, moderation, entitlement, and creator-commerce changes.</p>
        </div>
        <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--text-2)]">Latest {rows.length}</span>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="min-w-56 flex-1 text-[10px] font-black uppercase tracking-wider text-[var(--text-3)]">
          Search
          <span className="relative mt-1 block"><Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} /><input name="q" defaultValue={q} placeholder="Action, target, or request ID" className="ss-input h-10 pl-9 text-sm normal-case tracking-normal" /></span>
        </label>
        <label className="min-w-52 text-[10px] font-black uppercase tracking-wider text-[var(--text-3)]">
          Action
          <select name="action" defaultValue={action ?? ''} className="ss-input mt-1 h-10 text-sm normal-case tracking-normal"><option value="">All actions</option>{actions.map(value => <option key={value} value={value}>{value}</option>)}</select>
        </label>
        <button className="ss-button-primary h-10 px-5 text-sm">Apply</button>
        {(q || action) ? <Link href="/admin/audit" className="grid h-10 place-items-center px-3 text-xs font-bold text-[var(--text-3)] hover:text-[var(--text-1)]">Clear</Link> : null}
      </form>

      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">Audit events could not be loaded.</div> : null}
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        {rows.length === 0 ? <p className="p-12 text-center text-sm text-[var(--text-3)]">No audit events match these filters.</p> : rows.map(row => (
          <article key={row.id} className="grid gap-3 border-b border-[var(--border)] p-4 last:border-0 lg:grid-cols-[minmax(180px,.7fr)_minmax(240px,1fr)_minmax(260px,1.3fr)_160px] lg:items-center">
            <div><p className="text-xs font-black text-[var(--accent)]">{row.action}</p><p className="mt-1 text-xs text-[var(--text-3)]">{row.actor?.display_name || row.actor?.username || 'System'}{row.actor?.username ? ` · @${row.actor.username}` : ''}</p></div>
            <div><p className="text-sm font-bold text-[var(--text-1)]">{row.target_type}</p><p className="truncate font-mono text-[11px] text-[var(--text-3)]" title={row.target_id ?? undefined}>{row.target_id || 'No target ID'}</p></div>
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-2)] p-3 text-[10px] leading-4 text-[var(--text-2)]">{JSON.stringify(row.details ?? {}, null, 2)}</pre>
            <div className="text-xs text-[var(--text-3)]"><time>{new Date(row.created_at).toLocaleString()}</time>{row.request_id ? <p className="mt-1 truncate font-mono" title={row.request_id}>Req {row.request_id}</p> : null}{row.ip_address ? <p className="truncate font-mono">{row.ip_address}</p> : null}</div>
          </article>
        ))}
      </section>
    </main>
  )
}
