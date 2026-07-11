'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle } from 'lucide-react'

export function AdminCreatorActions({ applicationId, userId }: { applicationId: string, userId: string }) {
  const supabase = createClient()
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null)

  async function approve() {
    setLoading(true)
    await supabase.from('creator_applications').update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    }).eq('id', applicationId)
    await supabase.from('users').update({ account_type: 'creator' }).eq('id', userId)
    setDone('approved')
    setLoading(false)
  }

  async function reject() {
    setLoading(true)
    await supabase.from('creator_applications').update({
      status: 'rejected',
      rejection_reason: rejectReason.trim() || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', applicationId)
    setDone('rejected')
    setLoading(false)
  }

  if (done) {
    return (
      <p style={{ fontSize: 12, fontWeight: 700, color: done === 'approved' ? 'var(--green)' : 'var(--red)' }}>
        {done === 'approved' ? '✓ Approved — user is now a creator' : '✗ Rejected'}
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rejecting ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Rejection reason (optional — sent to user)"
            className="ss-input"
            style={{ fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reject} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
              <XCircle size={14} /> Confirm Reject
            </button>
            <button onClick={() => setRejecting(false)} style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'var(--surface-3)', color: 'var(--text-2)', border: '1px solid var(--border)', cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={approve} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', cursor: 'pointer',
          }}>
            <CheckCircle size={14} /> Approve
          </button>
          <button onClick={() => setRejecting(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: 'transparent', color: 'var(--red)', border: '1px solid rgba(255,77,106,0.3)', cursor: 'pointer',
          }}>
            <XCircle size={14} /> Reject
          </button>
        </div>
      )}
    </div>
  )
}
