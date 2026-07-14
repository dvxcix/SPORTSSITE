import { createClient } from '@/lib/supabase/server'
import { AdminReportActions } from '@/components/admin/AdminReportActions'
import { Flag, Search } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const TARGET_TYPES = ['post', 'user', 'comment', 'blog', 'event', 'page']
const STATUSES = ['pending', 'actioned', 'dismissed']

// Reports only ever stored a target_type + target_id — an admin acting on
// one had to manually guess what "post abc12345…" even was. Resolves each
// report's actual content so the row shows what's really being reported,
// with a link straight to it (or to the parent post, for a comment).
async function resolveTargets(supabase: any, reports: any[]) {
  const idsByType: Record<string, Set<string>> = {}
  for (const r of reports) {
    if (!r.target_type || !r.target_id) continue
    ;(idsByType[r.target_type] ??= new Set()).add(r.target_id)
  }

  const previews: Record<string, Record<string, { label: string; href: string }>> = {}

  if (idsByType.post?.size) {
    const { data } = await supabase.from('posts').select('id, content, author:users!posts_author_id_fkey(username)').in('id', Array.from(idsByType.post))
    previews.post = {}
    for (const p of data ?? []) previews.post[p.id] = { label: p.content?.slice(0, 80) || '(no text)', href: `/posts/${p.id}` }
  }
  if (idsByType.comment?.size) {
    const { data } = await supabase.from('comments').select('id, content, post_id').in('id', Array.from(idsByType.comment))
    previews.comment = {}
    for (const c of data ?? []) previews.comment[c.id] = { label: c.content?.slice(0, 80) || '(no text)', href: `/posts/${c.post_id}` }
  }
  if (idsByType.user?.size) {
    const { data } = await supabase.from('users').select('id, username, display_name').in('id', Array.from(idsByType.user))
    previews.user = {}
    for (const u of data ?? []) previews.user[u.id] = { label: `@${u.username}`, href: `/profile/${u.username}` }
  }
  if (idsByType.blog?.size) {
    const { data } = await supabase.from('blogs').select('id, title, slug').in('id', Array.from(idsByType.blog))
    previews.blog = {}
    for (const b of data ?? []) previews.blog[b.id] = { label: b.title || '(untitled)', href: `/blog/${b.slug}` }
  }
  if (idsByType.event?.size) {
    const { data } = await supabase.from('events').select('id, title').in('id', Array.from(idsByType.event))
    previews.event = {}
    for (const e of data ?? []) previews.event[e.id] = { label: e.title || '(untitled)', href: `/events/${e.id}` }
  }
  if (idsByType.page?.size) {
    const { data } = await supabase.from('pages').select('id, name, slug').in('id', Array.from(idsByType.page))
    previews.page = {}
    for (const p of data ?? []) previews.page[p.id] = { label: p.name || '(untitled)', href: `/pages/${p.slug}` }
  }

  return previews
}

export default async function AdminReportsPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; target_type?: string; q?: string }> }) {
  const { status, target_type, q } = await searchParams
  const supabase = await createClient()

  let reporterIds: string[] | null = null
  if (q) {
    const { data } = await supabase.from('users').select('id').or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    reporterIds = (data ?? []).map((u: any) => u.id)
  }

  let query = supabase
    .from('reports')
    .select('*, reporter:users!reports_reporter_id_fkey(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (status) query = query.eq('status', status)
  if (target_type) query = query.eq('target_type', target_type)
  if (q) query = query.in('reporter_id', reporterIds?.length ? reporterIds : ['00000000-0000-0000-0000-000000000000'])

  const { data: reports } = await query
  const previews = await resolveTargets(supabase, reports ?? [])

  const pending = (reports ?? []).filter((r: any) => r.status === 'pending')
  const reviewed = (reports ?? []).filter((r: any) => r.status !== 'pending')

  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const merged = { status, target_type, q, ...overrides }
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v)
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Flag size={20} className="text-red-400" />
        <h1 className="text-xl font-black text-white">Reports</h1>
        {pending.length > 0 && (
          <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{pending.length} pending</span>
        )}
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Reporter</label>
          <Search size={14} className="absolute left-3 top-1/2 mt-1 -translate-y-1/2 text-zinc-500" />
          <input name="q" defaultValue={q} placeholder="Search by reporter…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        {target_type && <input type="hidden" name="target_type" value={target_type} />}
        <button type="submit" className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
          Apply
        </button>
        {(q || status || target_type) && (
          <Link href="/admin/reports" className="text-xs font-bold text-zinc-500 hover:text-white px-2 py-2">Clear</Link>
        )}
      </form>

      <div className="flex flex-wrap gap-1 mb-1">
        <Link href={qs({ status: undefined })} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!status ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60'}`}>All statuses</Link>
        {STATUSES.map(s => (
          <Link key={s} href={qs({ status: s })} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${status === s ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60'}`}>{s}</Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mb-6">
        <Link href={qs({ target_type: undefined })} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!target_type ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60'}`}>All types</Link>
        {TARGET_TYPES.map(t => (
          <Link key={t} href={qs({ target_type: t })} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${target_type === t ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60'}`}>{t}</Link>
        ))}
      </div>

      {(reports?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-zinc-500">No reports match these filters</div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Pending Review</p>
              <div className="space-y-2">
                {pending.map((r: any) => <ReportRow key={r.id} report={r} preview={previews[r.target_type]?.[r.target_id]} />)}
              </div>
            </div>
          )}
          {reviewed.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Reviewed</p>
              <div className="space-y-2 opacity-60">
                {reviewed.map((r: any) => <ReportRow key={r.id} report={r} preview={previews[r.target_type]?.[r.target_id]} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReportRow({ report: r, preview }: { report: any; preview?: { label: string; href: string } }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-4">
      <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${r.status === 'pending' ? 'bg-red-400' : 'bg-zinc-600'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded">{r.target_type}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            r.status === 'pending' ? 'text-yellow-400 bg-yellow-400/10' :
            r.status === 'actioned' ? 'text-green-400 bg-green-400/10' :
            'text-zinc-500 bg-zinc-800'
          }`}>{r.status}</span>
        </div>
        <p className="text-sm font-bold text-white mt-1">{r.reason}</p>
        {r.details && <p className="text-xs text-zinc-500 mt-0.5">{r.details}</p>}
        {preview ? (
          <Link href={preview.href} target="_blank" className="block mt-2 text-xs text-blue-400 hover:underline bg-zinc-800/60 rounded-lg px-3 py-2 truncate">
            {preview.label} →
          </Link>
        ) : (
          <p className="mt-2 text-xs text-zinc-600 italic">Content no longer exists (ID: {r.target_id?.slice(0, 8)}…)</p>
        )}
        <p className="text-xs text-zinc-600 mt-1">
          Reported by @{r.reporter?.username ?? 'anonymous'} · {new Date(r.created_at).toLocaleString()}
        </p>
      </div>
      <AdminReportActions reportId={r.id} currentStatus={r.status} />
    </div>
  )
}
