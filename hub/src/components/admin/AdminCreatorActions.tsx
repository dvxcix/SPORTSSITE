'use client'
import { useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { useFeedback } from '@/components/ui/FeedbackProvider'

export function AdminCreatorActions({ applicationId, userId }: { applicationId: string; userId: string }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const { notify } = useFeedback()
  async function decide(decision: 'approved' | 'rejected') {
    setLoading(true)
    const response = await fetch(`/api/admin/creators/${applicationId}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, userId, reason }) })
    const payload = await response.json(); setLoading(false)
    if (!response.ok) { notify({ title: 'Decision not saved', message: payload.error || 'Please try again.', tone: 'error' }); return }
    setDone(decision)
  }
  if (done) return <p style={{ color: done === 'approved' ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{done === 'approved' ? 'Approved. Payment onboarding is now available.' : 'Application rejected.'}</p>
  return <div style={{ display: 'grid', gap: 8 }}>
    {rejecting && <input className="ss-input" value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason shown to the applicant" maxLength={500} />}
    <div style={{ display: 'flex', gap: 8 }}>
      {!rejecting && <button className="creator-studio-primary" disabled={loading} onClick={() => decide('approved')}><CheckCircle size={14} /> Approve</button>}
      <button className="creator-admin-reject" disabled={loading} onClick={() => rejecting ? decide('rejected') : setRejecting(true)}><XCircle size={14} /> {rejecting ? 'Confirm rejection' : 'Reject'}</button>
      {rejecting && <button className="creator-admin-cancel" onClick={() => setRejecting(false)}>Cancel</button>}
    </div>
  </div>
}
