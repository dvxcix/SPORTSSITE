/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminCreatorActions } from '@/components/admin/AdminCreatorActions'
import { Clock, CheckCircle, XCircle, Users, BadgeDollarSign, Layers3, ShieldCheck } from 'lucide-react'
import styles from './AdminCreators.module.css'

export const dynamic = 'force-dynamic'

export default async function AdminCreatorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (me?.account_type !== 'admin') redirect('/feed')

  const [{ data: apps }, { data: products }, { data: entitlements }, { data: events }] = await Promise.all([
    supabase.from('creator_applications').select('*, applicant:users!creator_applications_user_id_fkey(id, username, display_name, avatar_url, follower_count, email, creator_commerce_status, whop_connected_company_id)').order('created_at', { ascending: false }),
    supabase.from('creator_products').select('id,status,creator_id'),
    supabase.from('creator_entitlements').select('id,status,creator_id'),
    supabase.from('creator_commerce_events').select('id,amount,status,creator_id'),
  ])

  const pending = (apps ?? []).filter((a: any) => a.status === 'pending')
  const reviewed = (apps ?? []).filter((a: any) => a.status !== 'pending')

  return (
    <div className={styles.page}>
      <section className={styles.hero}><div><span><ShieldCheck size={14} /> CREATOR OPERATIONS</span><h1>Creator Control Center</h1><p>Review applicants, monitor activation, and oversee marketplace access.</p></div><Link href="/creators">View marketplace</Link></section>

      {/* Stats */}
      <div className={styles.stats}>
        {[
          { label: 'Pending', value: pending.length, icon: Clock, color: 'var(--gold)' },
          { label: 'Approved', value: (apps ?? []).filter((a: any) => a.status === 'approved').length, icon: CheckCircle, color: 'var(--green)' },
          { label: 'Rejected', value: (apps ?? []).filter((a: any) => a.status === 'rejected').length, icon: XCircle, color: 'var(--red)' },
          { label: 'Live Offers', value: (products ?? []).filter(item => item.status === 'active').length, icon: Layers3, color: 'var(--accent)' },
          { label: 'Active Members', value: (entitlements ?? []).filter(item => ['active', 'trialing'].includes(item.status)).length, icon: Users, color: 'var(--blue)' },
          { label: 'Recorded GMV', value: `$${(events ?? []).filter(item => item.amount && item.status !== 'failed').reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2)}`, icon: BadgeDollarSign, color: 'var(--accent)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={styles.stat}>
            <Icon size={20} style={{ color }} />
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>{value}</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className={styles.section}>
          <h2>
            Pending Review
          </h2>
          <div className={styles.list}>
            {pending.map((app: any) => (
              <ApplicationCard key={app.id} app={app} />
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div className={styles.empty}>
          <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontSize: 15, fontWeight: 700 }}>No pending applications</p>
        </div>
      )}

      {/* Reviewed */}
      {reviewed.length > 0 && (
        <div className={styles.section}>
          <h2>
            Previously Reviewed
          </h2>
          <div className={styles.list}>
            {reviewed.map((app: any) => (
              <ApplicationCard key={app.id} app={app} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ApplicationCard({ app, compact = false }: { app: any, compact?: boolean }) {
  const statusColor = app.status === 'approved' ? 'var(--green)' : app.status === 'rejected' ? 'var(--red)' : 'var(--gold)'
  const statusBg = app.status === 'approved' ? 'rgba(46,213,115,0.08)' : app.status === 'rejected' ? 'rgba(255,77,106,0.08)' : 'rgba(255,184,77,0.08)'

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: compact ? '14px 16px' : '20px', transition: 'border-color 150ms' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Avatar */}
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-3)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: 'var(--text-2)', flexShrink: 0 }}>
          {app.applicant?.avatar_url
            ? <img src={app.applicant.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (app.applicant?.display_name || app.applicant?.username || '?')[0].toUpperCase()
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: 'var(--text-1)', fontSize: 14 }}>{app.applicant?.display_name || app.applicant?.username}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>@{app.applicant?.username}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: statusBg, color: statusColor, border: `1px solid ${statusColor}40` }}>
              {app.status.toUpperCase()}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
              {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          {/* Sports */}
          {app.sports?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: compact ? 0 : 10 }}>
              {app.sports.map((s: string) => (
                <span key={s} style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(180,255,77,0.2)' }}>{s}</span>
              ))}
            </div>
          )}

          {!compact && (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, margin: '8px 0' }}>{app.why_creator}</p>
              {app.sample_picks && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sample Picks</p>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{app.sample_picks}</p>
                </div>
              )}
              {app.social_links && (app.social_links.twitter || app.social_links.instagram) && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  {app.social_links.twitter && <span style={{ fontSize: 12, color: 'var(--blue)' }}>𝕏 {app.social_links.twitter}</span>}
                  {app.social_links.instagram && <span style={{ fontSize: 12, color: 'var(--purple)' }}>IG {app.social_links.instagram}</span>}
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>{app.follower_count_at_apply ?? 0} followers at time of apply</p>

              {app.status === 'pending' && (
                <AdminCreatorActions applicationId={app.id} userId={app.user_id} />
              )}

              {app.status === 'rejected' && app.rejection_reason && (
                <p style={{ fontSize: 12, color: 'var(--red)', padding: '8px 12px', background: 'rgba(255,77,106,0.06)', borderRadius: 8, border: '1px solid rgba(255,77,106,0.15)' }}>
                  Rejection reason: {app.rejection_reason}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
