import { Trash2 } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminDeletionActions } from '@/components/admin/AdminDeletionActions'

export const dynamic = 'force-dynamic'

type DeletionRequest = {
  id: string
  status: string
  reason: string | null
  requested_at: string
  scheduled_for: string | null
  resolution_note: string | null
  user: {
    username: string | null
    display_name: string | null
    email: string | null
    tier: string | null
    account_type: string | null
    creator_commerce_status: string | null
  } | null
}

export default async function AdminDeletionRequestsPage() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('account_deletion_requests')
    .select('id,user_id,status,reason,requested_at,scheduled_for,resolution_note,user:users!account_deletion_requests_user_id_fkey(username,display_name,email,tier,account_type,creator_commerce_status)')
    .order('requested_at', { ascending: false }).limit(250)
  const requests = (data ?? []) as unknown as DeletionRequest[]

  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header><div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-red-300"><Trash2 size={14} /> Privacy operations</div><h1 className="text-2xl font-black text-white">Deletion requests</h1><p className="mt-1 text-sm text-zinc-400">Review billing, creator payouts, retained records, and active memberships before any permanent deletion.</p></header>
    {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">Deletion requests could not be loaded.</div> : null}
    <section className="space-y-3">
      {requests.length === 0 ? <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-12 text-center text-sm text-zinc-500">No deletion requests.</p> : requests.map(row => <article key={row.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-white">{row.user?.display_name || row.user?.username || 'Unknown account'}</h2><span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-300">{row.status}</span><span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400">{row.user?.tier || 'free'} · {row.user?.account_type || 'user'}</span></div><p className="mt-1 text-xs text-zinc-500">@{row.user?.username || 'unknown'} · {row.user?.email || 'No email'} · Requested {new Date(row.requested_at).toLocaleString()}</p></div><AdminDeletionActions requestId={row.id} status={row.status} /></div>
        {row.reason ? <p className="mt-4 rounded-xl bg-black/25 p-3 text-sm text-zinc-300">{row.reason}</p> : null}
        {row.scheduled_for ? <p className="mt-3 text-xs font-bold text-red-300">Scheduled for {new Date(row.scheduled_for).toLocaleString()}</p> : null}
        {row.resolution_note ? <p className="mt-2 text-xs text-zinc-400">Note: {row.resolution_note}</p> : null}
        {row.user?.creator_commerce_status && row.user.creator_commerce_status !== 'not_started' ? <p className="mt-2 text-xs font-bold text-amber-300">Creator commerce status: {row.user.creator_commerce_status}</p> : null}
      </article>)}
    </section>
  </main>
}
