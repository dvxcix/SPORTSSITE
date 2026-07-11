import { createClient } from '@/lib/supabase/server'
import { AdminReportActions } from '@/components/admin/AdminReportActions'
import { Flag } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const supabase = await createClient()

  const { data: reports } = await supabase
    .from('reports')
    .select('*, reporter:users!reports_reporter_id_fkey(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  const pending = (reports ?? []).filter((r: any) => r.status === 'pending')
  const reviewed = (reports ?? []).filter((r: any) => r.status !== 'pending')

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Flag size={20} className="text-red-400" />
        <h1 className="text-xl font-black text-white">Reports</h1>
        {pending.length > 0 && (
          <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{pending.length} pending</span>
        )}
      </div>

      {(reports?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-zinc-500">No reports yet</div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Pending Review</p>
              <div className="space-y-2">
                {pending.map((r: any) => <ReportRow key={r.id} report={r} />)}
              </div>
            </div>
          )}
          {reviewed.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Reviewed</p>
              <div className="space-y-2 opacity-60">
                {reviewed.map((r: any) => <ReportRow key={r.id} report={r} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReportRow({ report: r }: { report: any }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-4">
      <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${r.status === 'pending' ? 'bg-red-400' : 'bg-zinc-600'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded">{r.target_type}</span>
          <span className="text-xs text-zinc-500">ID: <span className="text-zinc-400 font-mono">{r.target_id?.slice(0, 8)}…</span></span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            r.status === 'pending' ? 'text-yellow-400 bg-yellow-400/10' :
            r.status === 'actioned' ? 'text-green-400 bg-green-400/10' :
            'text-zinc-500 bg-zinc-800'
          }`}>{r.status}</span>
        </div>
        <p className="text-sm font-bold text-white mt-1">{r.reason}</p>
        {r.details && <p className="text-xs text-zinc-500 mt-0.5">{r.details}</p>}
        <p className="text-xs text-zinc-600 mt-1">
          Reported by @{r.reporter?.username ?? 'anonymous'} · {new Date(r.created_at).toLocaleDateString()}
        </p>
      </div>
      <AdminReportActions reportId={r.id} currentStatus={r.status} />
    </div>
  )
}
