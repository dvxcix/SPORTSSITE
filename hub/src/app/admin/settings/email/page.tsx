import Link from 'next/link'
import { Activity, AlertTriangle, Eye, KeyRound, MailCheck, Send, ShieldCheck } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmailTestButton } from '@/components/admin/AdminEmailTestButton'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Delivery = {
  id: number
  status: string
  provider_status: number | null
  provider_message_id: string | null
  provider_event: string | null
  error: string | null
  attempted_at: string
}

const templatePreviews = [
  { id: 'welcome', label: 'Welcome', detail: 'New member onboarding' },
  { id: 'notification', label: 'Notification', detail: 'Opt-in member activity' },
  { id: 'security', label: 'Security', detail: 'Password and account changes' },
  { id: 'billing', label: 'Billing', detail: 'Membership and payment notices' },
]

function getSevenDayWindowStart() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
}

export default async function AdminEmailSettingsPage() {
  const admin = createAdminClient()
  const weekAgo = getSevenDayWindowStart()
  const [
    { count: sent },
    { count: failed },
    { count: webhookFailures },
    { data: recentData },
  ] = await Promise.all([
    admin.from('notification_delivery_attempts').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'sent').gte('attempted_at', weekAgo),
    admin.from('notification_delivery_attempts').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'failed').gte('attempted_at', weekAgo),
    admin.from('provider_webhook_events').select('id', { count: 'exact', head: true }).eq('provider', 'resend').eq('status', 'failed').gte('received_at', weekAgo),
    admin.from('notification_delivery_attempts').select('id,status,provider_status,provider_message_id,provider_event,error,attempted_at').eq('channel', 'email').order('attempted_at', { ascending: false }).limit(40),
  ])

  const recent = (recentData ?? []) as Delivery[]
  const apiReady = Boolean(process.env.EMAIL_RESEND_API_KEY || process.env.RESEND_API_KEY)
  const domainReady = Boolean(process.env.EMAIL_RESEND_EMAIL_DOMAIN || process.env.RESEND_EMAIL_DOMAIN)
  const webhookReady = Boolean(process.env.RESEND_WEBHOOK_SECRET)
  const authTemplatesReady = process.env.SUPABASE_AUTH_EMAILS_BRANDED === 'true'
  const allReady = apiReady && domainReady && webhookReady && authTemplatesReady

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <AdminPageHeader
        eyebrow="Platform delivery"
        title="Email operations"
        description="Configuration, branded template previews, provider lifecycle events, and recent transactional delivery outcomes."
        icon={MailCheck}
        actions={<AdminEmailTestButton disabled={!apiReady} />}
      />

      {!allReady && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/8 p-4 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={17} aria-hidden="true" />
          <div><p className="font-extrabold">Email delivery is not fully instrumented.</p><p className="mt-1 text-xs leading-5 text-amber-100/70">Add the missing environment values shown below, then redeploy. Secrets are never displayed here.</p></div>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Email configuration">
        <StatusCard icon={Send} label="Resend API" ready={apiReady} detail={apiReady ? 'Sending enabled' : 'API key missing'} />
        <StatusCard icon={MailCheck} label="Sender domain" ready={domainReady} detail={domainReady ? 'Custom domain configured' : 'Explicit domain missing'} />
        <StatusCard icon={ShieldCheck} label="Signed webhooks" ready={webhookReady} detail={webhookReady ? 'Verification enabled' : 'Signing secret missing'} />
        <StatusCard icon={KeyRound} label="Auth templates" ready={authTemplatesReady} detail={authTemplatesReady ? 'Hosted templates verified' : 'Hosted templates not verified'} />
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between"><p className="text-xs font-extrabold text-[var(--text-secondary)]">Last 7 days</p><Activity size={16} className="text-[var(--accent-primary)]" /></div>
          <p className="mt-3 text-2xl font-black text-[var(--text-primary)]">{sent ?? 0} sent</p>
          <p className={`mt-1 text-xs ${(failed ?? 0) + (webhookFailures ?? 0) > 0 ? 'text-red-300' : 'text-emerald-300'}`}>{failed ?? 0} delivery failures · {webhookFailures ?? 0} webhook failures</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-card)]">
        <div className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent-primary)]">Template gallery</p>
          <h2 className="mt-1 text-base font-black text-[var(--text-primary)]">Production email previews</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Rendered from the same shared shell used by live sends.</p>
        </div>
        <div className="grid gap-px bg-[var(--border-subtle)] sm:grid-cols-2 xl:grid-cols-4">
          {templatePreviews.map(template => (
            <Link key={template.id} href={`/api/admin/email/preview?template=${template.id}`} target="_blank" className="group flex min-h-28 items-center gap-3 bg-[var(--surface-raised)] p-4 transition hover:bg-[var(--surface-2)]">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--border-accent)] bg-[var(--accent-muted)] text-[var(--accent-primary)]"><Eye size={17} /></span>
              <span className="min-w-0"><span className="block font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)]">{template.label}</span><span className="mt-1 block text-xs text-[var(--text-muted)]">{template.detail}</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Delivery ledger</p><h2 className="mt-1 text-base font-black text-[var(--text-primary)]">Recent notification emails</h2></div>
          <span className="text-xs text-[var(--text-muted)]">Latest 40 attempts</span>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-[var(--text-muted)]">No notification-email attempts recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"><tr><th className="px-5 py-3">Time</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Provider event</th><th className="px-4 py-3">Provider ID</th><th className="px-5 py-3">Detail</th></tr></thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {recent.map(item => (
                  <tr key={item.id} className="text-[var(--text-secondary)]">
                    <td className="whitespace-nowrap px-5 py-3">{new Date(item.attempted_at).toLocaleString()}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-extrabold ${item.status === 'sent' ? 'bg-emerald-400/10 text-emerald-300' : item.status === 'failed' ? 'bg-red-400/10 text-red-300' : 'bg-zinc-400/10 text-zinc-300'}`}>{item.status}</span></td>
                    <td className="px-4 py-3 font-mono text-[11px]">{item.provider_event || 'API accepted'}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-muted)]" title={item.provider_message_id || undefined}>{item.provider_message_id ? `${item.provider_message_id.slice(0, 12)}…` : item.provider_status || '—'}</td>
                    <td className="max-w-sm truncate px-5 py-3 text-[var(--text-muted)]" title={item.error || undefined}>{item.error || 'No error reported'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatusCard({ icon: Icon, label, ready, detail }: { icon: typeof Send; label: string; ready: boolean; detail: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between"><p className="text-xs font-extrabold text-[var(--text-secondary)]">{label}</p><Icon size={16} className={ready ? 'text-emerald-400' : 'text-amber-400'} /></div>
      <p className={`mt-3 text-lg font-black ${ready ? 'text-emerald-300' : 'text-amber-300'}`}>{ready ? 'Ready' : 'Needs setup'}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{detail}</p>
    </div>
  )
}
