/* eslint-disable react-hooks/purity -- This force-dynamic operations page intentionally calculates request-time freshness. */
import Image from 'next/image'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  FileText,
  Flag,
  LayoutDashboard,
  MessageSquare,
  Radio,
  Settings,
  ShieldAlert,
  Trash2,
  Users,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminStatCard } from '@/components/admin/AdminStatCard'
import { Badge } from '@/components/ui/badge'
import { TRACKED_PIPELINES } from '@/lib/pipelineRegistry'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type RecentUser = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  account_type: string | null
  created_at: string
}

type RecentPost = {
  id: string
  content: string | null
  created_at: string
  author: { username: string | null } | null
}

type PipelineRun = {
  job_name: string
  status: 'running' | 'succeeded' | 'failed'
  started_at: string
}

const sectionClass = 'overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_94%,transparent)] shadow-[var(--shadow-card)]'

export default async function AdminDashboard() {
  const supabase = createAdminClient()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [
    { count: userCount },
    { count: postCount },
    { count: groupCount },
    { count: reportCount },
    { count: creatorCount },
    { count: deletionCount },
    { count: webhookFailures },
    { count: pushFailures },
    { data: recentUsersData },
    { data: recentPostsData },
    { data: pipelineData },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('posts').select('*', { count: 'exact', head: true }),
    supabase.from('groups').select('*', { count: 'exact', head: true }),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('creator_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('account_deletion_requests').select('*', { count: 'exact', head: true }).in('status', ['pending', 'reviewing', 'scheduled', 'blocked']),
    supabase.from('provider_webhook_events').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('notification_delivery_attempts').select('*', { count: 'exact', head: true }).eq('status', 'failed').gte('attempted_at', dayAgo),
    supabase.from('users').select('id, username, display_name, avatar_url, account_type, created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('posts').select('id, content, created_at, author:users!posts_author_id_fkey(username)').order('created_at', { ascending: false }).limit(6),
    supabase.from('pipeline_runs').select('job_name,status,started_at').order('started_at', { ascending: false }).limit(400),
  ])

  const recentUsers = (recentUsersData ?? []) as RecentUser[]
  const recentPosts = (recentPostsData ?? []) as unknown as RecentPost[]
  const pipelineRuns = (pipelineData ?? []) as PipelineRun[]
  const latestRuns = new Map<string, PipelineRun>()
  for (const run of pipelineRuns) if (!latestRuns.has(run.job_name)) latestRuns.set(run.job_name, run)
  const pipelineRows = TRACKED_PIPELINES.map(pipeline => {
    const run = latestRuns.get(pipeline.name)
    const ageMinutes = run ? (Date.now() - new Date(run.started_at).getTime()) / 60_000 : Infinity
    const timedOut = run?.status === 'running' && ageMinutes > Math.min(10, pipeline.staleAfterMinutes)
    const state = !run ? 'unknown' : timedOut ? 'timed_out' : run.status === 'failed' ? 'failed' : ageMinutes > pipeline.staleAfterMinutes ? 'stale' : run.status
    return { pipeline, run, state }
  })
  const pipelineIssues = pipelineRows.filter(row => ['failed', 'stale', 'timed_out'].includes(row.state)).length
  const pipelineHealthy = pipelineRows.filter(row => row.state === 'succeeded' || row.state === 'running').length
  const actionTotal = (reportCount ?? 0) + (creatorCount ?? 0) + (deletionCount ?? 0) + (webhookFailures ?? 0) + (pushFailures ?? 0) + pipelineIssues

  const stats = [
    { label: 'Members', value: userCount ?? 0, icon: Users, tone: 'info' as const, detail: 'Registered accounts' },
    { label: 'Published posts', value: postCount ?? 0, icon: FileText, tone: 'success' as const, detail: 'Community content' },
    { label: 'Community spaces', value: groupCount ?? 0, icon: MessageSquare, tone: 'warning' as const, detail: 'Active groups' },
    { label: 'Action queue', value: actionTotal, icon: ShieldAlert, tone: actionTotal > 0 ? 'danger' as const : 'success' as const, detail: actionTotal > 0 ? 'Items needing review' : 'All queues clear' },
  ]

  const queues = [
    { label: 'Moderation reports', value: reportCount ?? 0, detail: 'Reported content and accounts', href: '/admin/reports', icon: Flag, tone: 'danger' as const },
    { label: 'Creator applications', value: creatorCount ?? 0, detail: 'Applicants awaiting approval', href: '/admin/creators', icon: Zap, tone: 'warning' as const },
    { label: 'Deletion requests', value: deletionCount ?? 0, detail: 'Privacy operations queue', href: '/admin/users/deletions', icon: Trash2, tone: 'danger' as const },
    { label: 'Webhook failures', value: webhookFailures ?? 0, detail: 'Provider events to inspect', href: '/admin/pipeline-health', icon: Webhook, tone: 'warning' as const },
    { label: 'Push failures', value: pushFailures ?? 0, detail: 'Delivery failures in 24 hours', href: '/admin/pipeline-health', icon: Bell, tone: 'warning' as const },
    { label: 'Pipeline issues', value: pipelineIssues, detail: `${pipelineHealthy} of ${TRACKED_PIPELINES.length} reporting healthy`, href: '/admin/pipeline-health', icon: Activity, tone: 'danger' as const },
  ]

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:space-y-8 lg:px-8 lg:py-8">
      <AdminPageHeader
        title="Control center"
        description="A single operational view of platform health, member activity, moderation, creator commerce, and work that needs attention."
        icon={LayoutDashboard}
        actions={(
          <Link href="/admin/pipeline-health" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border-2)] bg-[var(--surface-2)] px-3 text-xs font-extrabold text-[var(--text-2)] transition hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border-2))] hover:text-[var(--accent)]">
            <Activity size={14} aria-hidden="true" /> System health
          </Link>
        )}
      />

      <section aria-label="Platform overview" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map(stat => <AdminStatCard key={stat.label} {...stat} />)}
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[radial-gradient(circle_at_10%_0,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_35rem),var(--surface-raised)] p-4 shadow-[var(--shadow-card)] sm:p-5 lg:p-6" aria-labelledby="operations-heading">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-70" />
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">Operational inbox</p>
            <h2 id="operations-heading" className="mt-1 text-lg font-black text-[var(--text-1)]">What needs attention</h2>
            <p className="mt-1 text-xs text-[var(--text-3)]">Live queues from moderation, creator operations, privacy, delivery, and production jobs.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-black/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-2)]">
            <span className={`size-2 rounded-full ${actionTotal > 0 ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,.8)]' : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]'}`} />
            {actionTotal > 0 ? `${actionTotal} open signals` : 'All clear'}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {queues.map(queue => <QueueCard key={queue.label} {...queue} />)}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className={sectionClass} aria-labelledby="quick-actions-heading">
          <div className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Workspaces</p>
            <h2 id="quick-actions-heading" className="mt-1 text-base font-black text-[var(--text-primary)]">Run the platform</h2>
          </div>
          <div className="grid gap-px bg-[var(--border-subtle)] sm:grid-cols-2">
            <WorkspaceLink href="/admin/users" icon={Users} label="Members" detail="Accounts, access, tiers, and restrictions" />
            <WorkspaceLink href="/admin/creators" icon={Zap} label="Creators" detail="Applications, offers, memberships, and payouts" />
            <WorkspaceLink href="/admin/pipeline-health" icon={Activity} label="Data operations" detail="Pipelines, telemetry, webhooks, and retention" />
            <WorkspaceLink href="/admin/notifications" icon={Bell} label="Engagement" detail="Broadcasts, push delivery, and release messaging" />
            <WorkspaceLink href="/admin/live" icon={Radio} label="Live" detail="Rooms, streams, and realtime experiences" />
            <WorkspaceLink href="/admin/settings/features" icon={Settings} label="Platform controls" detail="Features, integrations, design, and configuration" />
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="pipeline-snapshot-heading">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
            <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Production</p><h2 id="pipeline-snapshot-heading" className="mt-1 text-base font-black text-[var(--text-primary)]">Pipeline snapshot</h2></div>
            <Link href="/admin/pipeline-health" className="text-xs font-extrabold text-[var(--accent-primary)] hover:underline">Details</Link>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {pipelineRows.slice(0, 7).map(({ pipeline, run, state }) => {
              const healthy = state === 'succeeded' || state === 'running'
              return (
                <div key={pipeline.name} className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${healthy ? 'bg-emerald-400/10 text-emerald-400' : state === 'unknown' ? 'bg-zinc-500/10 text-zinc-500' : 'bg-amber-400/10 text-amber-400'}`}>
                    {healthy ? <CheckCircle2 size={15} aria-hidden="true" /> : <Activity size={15} aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-[var(--text-1)]">{pipeline.label}</p><p className="mt-0.5 truncate text-[10px] text-[var(--text-3)]">{pipeline.area} · {pipeline.schedule}</p></div>
                  <div className="shrink-0 text-right"><p className={`text-[10px] font-black uppercase ${healthy ? 'text-emerald-400' : 'text-amber-400'}`}>{state}</p><p className="mt-0.5 text-[9px] text-[var(--text-3)]">{run ? relativeTime(run.started_at) : 'No signal'}</p></div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className={sectionClass}>
          <SectionHeader title="Recent members" href="/admin/users" />
          <div className="divide-y divide-[var(--border-subtle)]">
            {recentUsers.length > 0 ? recentUsers.map(user => {
              const name = user.display_name || user.username || 'Unnamed user'
              return (
                <div key={user.id} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)] sm:px-5">
                  <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--surface-overlay)] text-xs font-black text-[var(--text-primary)]">
                    {user.avatar_url ? <Image src={user.avatar_url} alt="" fill sizes="40px" className="object-cover" unoptimized /> : name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[var(--text-primary)]">{name}</p><p className="truncate text-xs text-[var(--text-muted)]">@{user.username || 'pending'}</p></div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {user.account_type && user.account_type !== 'user' ? <Badge variant={user.account_type === 'admin' ? 'danger' : 'popular'}>{user.account_type}</Badge> : null}
                    <time className="text-[10px] tabular-nums text-[var(--text-muted)]">{relativeTime(user.created_at)}</time>
                  </div>
                </div>
              )
            }) : <EmptyRow label="No recent members" />}
          </div>
        </section>

        <section className={sectionClass}>
          <SectionHeader title="Recent posts" href="/admin/content/posts" />
          <div className="divide-y divide-[var(--border-subtle)]">
            {recentPosts.length > 0 ? recentPosts.map(post => (
              <article key={post.id} className="px-4 py-3 transition-colors hover:bg-[var(--surface-hover)] sm:px-5">
                <div className="mb-1 flex items-center justify-between gap-3"><p className="truncate text-xs font-bold text-[var(--accent-primary)]">@{post.author?.username || 'unknown'}</p><time className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{relativeTime(post.created_at)}</time></div>
                <p className="line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{post.content || 'Post has no text content.'}</p>
              </article>
            )) : <EmptyRow label="No recent posts" />}
          </div>
        </section>
      </div>
    </div>
  )
}

function QueueCard({ icon: Icon, label, value, detail, href, tone }: { icon: LucideIcon; label: string; value: number; detail: string; href: string; tone: 'warning' | 'danger' }) {
  const active = value > 0
  const toneClass = !active ? 'text-emerald-400 bg-emerald-400/10' : tone === 'danger' ? 'text-red-400 bg-red-400/10' : 'text-amber-400 bg-amber-400/10'
  return (
    <Link href={href} className="group flex min-h-24 items-center gap-3 rounded-2xl border border-[var(--border)] bg-black/15 p-3.5 transition hover:-translate-y-0.5 hover:border-[var(--border-2)] hover:bg-[var(--surface-2)] sm:p-4">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClass}`}><Icon size={17} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-[var(--text-1)] sm:text-sm">{label}</strong><b className={`text-xl tabular-nums ${active ? tone === 'danger' ? 'text-red-400' : 'text-amber-400' : 'text-emerald-400'}`}>{value}</b></span><span className="mt-1 block text-[10px] leading-4 text-[var(--text-3)] sm:text-xs">{active ? detail : 'Queue is clear'}</span></span>
      <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-[var(--text-3)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
    </Link>
  )
}

function WorkspaceLink({ href, icon: Icon, label, detail }: { href: string; icon: LucideIcon; label: string; detail: string }) {
  return (
    <Link href={href} className="group flex min-h-24 items-center gap-3 bg-[var(--surface-raised)] p-4 transition hover:bg-[var(--surface-hover)] sm:p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] text-[var(--text-muted)] transition group-hover:border-[color-mix(in_srgb,var(--accent-primary)_30%,var(--border))] group-hover:text-[var(--accent-primary)]"><Icon size={17} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--text-primary)]">{label}</strong><span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{detail}</span></span>
      <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-[var(--text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent-primary)]" />
    </Link>
  )
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
      <h2 className="text-sm font-black text-[var(--text-primary)]">{title}</h2>
      <Link href={href} className="group flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-muted)]">View all <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></Link>
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return <p className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">{label}</p>
}

function relativeTime(date: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
