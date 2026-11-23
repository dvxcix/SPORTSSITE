/* eslint-disable react-hooks/purity -- This force-dynamic operations page intentionally calculates request-time freshness. */
import Image from 'next/image'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  Cloud,
  Flag,
  LayoutDashboard,
  Radio,
  Settings,
  Trash2,
  Users,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import styles from '@/components/admin/adminWorkspace.module.css'
import { Badge } from '@/components/ui/badge'
import { EmojiText } from '@/components/social/EmojiText'
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
    { count: userCount, error: userError },
    { count: postCount, error: postError },
    { count: groupCount, error: groupError },
    { count: reportCount, error: reportError },
    { count: creatorCount, error: creatorError },
    { count: deletionCount, error: deletionError },
    { count: webhookFailures, error: webhookError },
    { count: pushFailures, error: pushError },
    { data: recentUsersData, error: recentUsersError },
    { data: recentPostsData, error: recentPostsError },
    { data: pipelineData, error: pipelineError },
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('posts').select('*', { count: 'exact', head: true }).neq('visibility', 'private'),
    supabase.from('groups').select('*', { count: 'exact', head: true }),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('creator_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('account_deletion_requests').select('*', { count: 'exact', head: true }).in('status', ['pending', 'reviewing', 'scheduled', 'blocked']),
    supabase.from('provider_webhook_events').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('notification_delivery_attempts').select('*', { count: 'exact', head: true }).eq('status', 'failed').gte('attempted_at', dayAgo),
    supabase.from('users').select('id, username, display_name, avatar_url, account_type, created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('posts').select('id, content, created_at, author:users!posts_author_id_fkey(username)').neq('visibility', 'private').order('created_at', { ascending: false }).limit(6),
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
  const pipelineUnknown = pipelineRows.filter(row => row.state === 'unknown').length
  const countValue = (count: number | null, error: unknown) => error ? null : count
  const queueCounts = [countValue(reportCount, reportError), countValue(creatorCount, creatorError), countValue(deletionCount, deletionError), countValue(webhookFailures, webhookError), countValue(pushFailures, pushError)]
  const statusIncomplete = queueCounts.some(value => value == null) || !!pipelineError || pipelineUnknown > 0
  const actionTotal = statusIncomplete ? null : queueCounts.reduce<number>((sum, value) => sum + (value ?? 0), pipelineIssues)

  const stats = [
    { label: 'Members', value: countValue(userCount, userError), detail: 'Registered accounts' },
    { label: 'Published posts', value: countValue(postCount, postError), detail: 'Community content' },
    { label: 'Community spaces', value: countValue(groupCount, groupError), detail: 'Created groups' },
  ]

  const queues = [
    { label: 'Moderation reports', value: queueCounts[0], detail: 'Reported content and accounts', href: '/admin/reports', icon: Flag, tone: 'danger' as const },
    { label: 'Creator applications', value: queueCounts[1], detail: 'Legacy applications awaiting review', href: '/admin/creators', icon: Zap, tone: 'warning' as const },
    { label: 'Deletion requests', value: queueCounts[2], detail: 'Privacy operations queue', href: '/admin/users/deletions', icon: Trash2, tone: 'danger' as const },
    { label: 'Webhook failures', value: queueCounts[3], detail: 'Provider events to inspect', href: '/admin/pipeline-health', icon: Webhook, tone: 'warning' as const },
    { label: 'Push failures', value: queueCounts[4], detail: 'Delivery failures in 24 hours', href: '/admin/pipeline-health', icon: Bell, tone: 'warning' as const },
    { label: 'Pipeline issues', value: pipelineError ? null : pipelineIssues, detail: `${pipelineHealthy} reporting healthy${pipelineUnknown ? ` · ${pipelineUnknown} without a signal` : ''}`, href: '/admin/pipeline-health', icon: Activity, tone: 'danger' as const },
  ]

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:space-y-8 lg:px-8 lg:py-8">
      <AdminPageHeader
        title="Control center"
        description="Platform activity and work awaiting review."
        icon={LayoutDashboard}
        actions={(
          <Link href="/admin/pipeline-health" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border-2)] bg-[var(--surface-2)] px-3 text-xs font-extrabold text-[var(--text-2)] transition hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border-2))] hover:text-[var(--accent)]">
            <Activity size={14} aria-hidden="true" /> System health
          </Link>
        )}
      />

      <section className={styles.attention} aria-labelledby="operations-heading">
        <div className={styles.attentionHeader}>
          <div>
            <h2 id="operations-heading">What needs attention</h2>
            <p>Member support, moderation and delivery.</p>
          </div>
          <span className={styles.attentionCount}><strong>{actionTotal == null ? 'Unknown' : actionTotal.toLocaleString()}</strong><small>{actionTotal == null ? 'Status incomplete' : actionTotal > 0 ? 'Items to review' : 'Queues clear'}</small></span>
        </div>
        {statusIncomplete && <p className={styles.notice}>Some status checks are unavailable. Open the relevant tool to inspect its latest activity.</p>}
        <div className="grid gap-x-6 sm:grid-cols-2">
          {[...queues].sort((a,b) => (b.value ?? -1) - (a.value ?? -1)).map(queue => <QueueCard key={queue.label} {...queue} />)}
        </div>
      </section>

      <dl aria-label="Platform overview" className={styles.metricStrip}>
        {stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value == null ? 'Unavailable' : stat.value.toLocaleString()}<small>{stat.detail}</small></dd></div>)}
      </dl>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className={sectionClass} aria-labelledby="quick-actions-heading">
          <div className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Workspaces</p>
            <h2 id="quick-actions-heading" className="mt-1 text-base font-semibold text-[var(--text-primary)]">Run the platform</h2>
          </div>
          <div className="grid gap-px bg-[var(--border-subtle)] sm:grid-cols-2">
            <WorkspaceLink href="/admin/users" icon={Users} label="Members" detail="Accounts, access, tiers, and restrictions" />
            <WorkspaceLink href="/admin/creators" icon={Zap} label="Creators" detail="Applications, offers, memberships, and payouts" />
            <WorkspaceLink href="/admin/pipeline-health" icon={Activity} label="Data operations" detail="Pipelines, telemetry, webhooks, and retention" />
            <WorkspaceLink href="/admin/browserbase" icon={Cloud} label="Browser automation" detail="Proxy spend, scraper attribution, and session forensics" />
            <WorkspaceLink href="/admin/notifications" icon={Bell} label="Engagement" detail="Broadcasts, push delivery, and release messaging" />
            <WorkspaceLink href="/admin/groups" icon={Radio} label="Communities" detail="Groups, channels and memberships" />
            <WorkspaceLink href="/admin/settings/features" icon={Settings} label="Platform controls" detail="Features, integrations, design, and configuration" />
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="pipeline-snapshot-heading">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
            <div><p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Production</p><h2 id="pipeline-snapshot-heading" className="mt-1 text-base font-semibold text-[var(--text-primary)]">Pipeline snapshot</h2></div>
            <Link href="/admin/pipeline-health" className="text-xs font-extrabold text-[var(--accent-primary)] hover:underline">Details</Link>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {pipelineRows.slice(0, 7).map(({ pipeline, run, state }) => {
              const healthy = state === 'succeeded' || state === 'running'
              return (
                <div key={pipeline.name} className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${healthy ? 'bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-[var(--green)]' : state === 'unknown' ? 'bg-[color-mix(in_srgb,var(--surface-3)_10%,transparent)] text-[var(--text-3)]' : 'bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] text-[var(--gold)]'}`}>
                    {healthy ? <CheckCircle2 size={15} aria-hidden="true" /> : <Activity size={15} aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-[var(--text-1)]">{pipeline.label}</p><p className="mt-0.5 truncate text-[12px] text-[var(--text-3)]">{pipeline.area} · {pipeline.schedule}</p></div>
                  <div className="shrink-0 text-right"><p className={`text-[12px] font-semibold uppercase ${healthy ? 'text-[var(--green)]' : 'text-[var(--gold)]'}`}>{state}</p><p className="mt-0.5 text-[11px] text-[var(--text-3)]">{run ? relativeTime(run.started_at) : 'No signal'}</p></div>
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
                  <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--surface-overlay)] text-xs font-semibold text-[var(--text-primary)]">
                    {user.avatar_url ? <Image src={user.avatar_url} alt="" fill sizes="40px" className="object-cover" unoptimized /> : name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[var(--text-primary)]">{name}</p><p className="truncate text-xs text-[var(--text-muted)]">@{user.username || 'pending'}</p></div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {user.account_type && user.account_type !== 'user' ? <Badge variant={user.account_type === 'admin' ? 'danger' : 'popular'}>{user.account_type}</Badge> : null}
                    <time className="text-[12px] tabular-nums text-[var(--text-muted)]">{relativeTime(user.created_at)}</time>
                  </div>
                </div>
              )
            }) : <EmptyRow label={recentUsersError ? 'Recent members are unavailable. Open Members to retry.' : 'No recent members'} />}
          </div>
        </section>

        <section className={sectionClass}>
          <SectionHeader title="Recent posts" href="/admin/content/posts" />
          <div className="divide-y divide-[var(--border-subtle)]">
            {recentPosts.length > 0 ? recentPosts.map(post => (
              <article key={post.id} className="px-4 py-3 transition-colors hover:bg-[var(--surface-hover)] sm:px-5">
                <div className="mb-1 flex items-center justify-between gap-3"><p className="truncate text-xs font-bold text-[var(--accent-primary)]">@{post.author?.username || 'unknown'}</p><time className="shrink-0 text-[12px] tabular-nums text-[var(--text-muted)]">{relativeTime(post.created_at)}</time></div>
                <p className="line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]"><EmojiText text={post.content || 'Post has no text content.'} /></p>
              </article>
            )) : <EmptyRow label={recentPostsError ? 'Recent posts are unavailable. Open Posts to retry.' : 'No recent posts'} />}
          </div>
        </section>
      </div>
    </div>
  )
}

function QueueCard({ icon: Icon, label, value, detail, href, tone }: { icon: LucideIcon; label: string; value: number | null; detail: string; href: string; tone: 'warning' | 'danger' }) {
  const active = value != null && value > 0
  const toneClass = value == null ? 'text-[var(--text-3)]' : !active ? 'text-[var(--green)]' : tone === 'danger' ? 'text-[var(--red)]' : 'text-[var(--gold)]'
  return (
    <Link href={href} className="group flex min-h-20 items-center gap-3 border-b border-[var(--border)] px-1 py-3 transition-colors hover:bg-[var(--surface-2)]">
      <span className={`grid size-8 shrink-0 place-items-center ${toneClass}`}><Icon size={17} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="text-xs text-[var(--text-1)] sm:text-sm">{label}</strong><b className={`text-lg tabular-nums ${toneClass}`}>{value == null ? '?' : value.toLocaleString()}</b></span><span className="mt-1 block text-[12px] leading-4 text-[var(--text-3)]">{value == null ? 'Status unavailable' : active ? detail : label === 'Pipeline issues' ? detail : 'Queue is clear'}</span></span>
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
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
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
