'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Flag } from 'lucide-react'

const REASONS = [
  'Spam or misleading',
  'Harassment or bullying',
  'False pick / misleading record',
  'Inappropriate content',
  'Impersonation',
  'Other',
]

export function ReportModal({ targetType, targetId, onClose }: {
  targetType: 'post' | 'user' | 'comment' | 'blog' | 'event' | 'page'
  targetId: string
  onClose: () => void
}) {
  const supabase = createClient()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (!reason) return
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('reports').insert({
      reporter_id: user?.id ?? null,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details.trim() || null,
      status: 'pending',
    })
    setDone(true)
    setSubmitting(false)
    setTimeout(onClose, 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <p className="text-2xl mb-2">✅</p>
            <p className="font-bold text-white">Report submitted</p>
            <p className="text-xs text-zinc-400 mt-1">Our team will review it</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-white flex items-center gap-2"><Flag size={16} className="text-red-400" /> Report</h2>
              <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-2 mb-4">
              {REASONS.map(r => (
                <label key={r} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${reason === r ? 'border-red-500/40 bg-red-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}>
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-red-500" />
                  <span className="text-sm text-zinc-300">{r}</span>
                </label>
              ))}
            </div>
            <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Additional details (optional)" rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none mb-4 resize-none" />
            <button onClick={submit} disabled={submitting || !reason}
              className="w-full bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white font-black py-2.5 rounded-xl transition-colors">
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
