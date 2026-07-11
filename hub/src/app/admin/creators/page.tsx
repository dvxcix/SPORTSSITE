import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminCreatorActions } from '@/components/admin/AdminCreatorActions'
import { Clock, CheckCircle, XCircle, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminCreatorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (me?.account_type !== 'admin') redirect('/feed')

  const { data: apps } = await supabase
    .from('creator_applications')
    .select('*, applicant:users!creator_applications_user_id_fkey(id, username, display_name, avatar_url, follower_count, email)')
    .order('created_at', { ascending: false })

  const pending = (apps ?? []).filter((a: any) => a.status === 'pending')
  const reviewed = (apps ?? []).filter((a: any) => a.status !== 'pending')

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6 }}>Creator Applications</h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>{pending.length} pending review</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Pending', value: pending.length, icon: Clock, color: 'var(--gold)' },
          { label: 'Approved', value: (apps ?? []).filter((a: any) => a.status === 'approved').length, icon: CheckCircle, color: 'var(--green)' },
          { label: 'Rejected', value: (apps ?? []).filter((a: any) => a.status === 'rejected').length, icon: XCircle, color: 'var(--red)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
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
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
            Pending Review
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pending.map((app: any) => (
              <ApplicationCard key={app.id} app={app} />
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)' }}>
          <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontSize: 15, fontWeight: 700 }}>No pending applications</p>
        </div>
      )}

      {/* Reviewed */}
      {reviewed.length > 0 && (
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
            Previously Reviewed
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
