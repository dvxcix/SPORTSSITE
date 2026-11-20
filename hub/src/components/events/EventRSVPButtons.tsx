'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, Star, X } from 'lucide-react'

type RSVPStatus = 'going' | 'interested' | 'not_going' | null

export function EventRSVPButtons({ userId, eventId, initialRsvp }: {
  userId: string; eventId: string; initialRsvp: string | null
}) {
  const [rsvp, setRsvp] = useState<RSVPStatus>(initialRsvp as RSVPStatus)
  const [loading, setLoading] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  async function select(status: RSVPStatus) {
    setLoading(true)
    const prevRsvp = rsvp
    let error
    if (rsvp === status) {
      setRsvp(null)
      ;({ error } = await supabase.from('event_rsvps').delete().match({ user_id: userId, event_id: eventId }))
    } else {
      setRsvp(status)
      ;({ error } = await supabase.from('event_rsvps').upsert({ user_id: userId, event_id: eventId, status }, { onConflict: 'user_id,event_id' }))
    }
    // Only reflect success in the UI if the write actually succeeded — this
    // previously flipped state unconditionally, so a failed write left the
    // buttons showing an RSVP status that didn't match the database.
    if (error) setRsvp(prevRsvp)
    setLoading(false)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {([
        { s: 'going' as const, label: "I'm Going", icon: Check, activeColor: 'bg-[var(--accent-fill)] text-[var(--accent-fg)]' },
        { s: 'interested' as const, label: 'Interested', icon: Star, activeColor: 'bg-yellow-500 text-[var(--accent-fg)]' },
        { s: 'not_going' as const, label: "Can't Go", icon: X, activeColor: 'bg-[var(--surface-3)] text-[var(--text-1)]' },
      ]).map(({ s, label, icon: Icon, activeColor }) => (
        <button key={s} type="button" onClick={() => select(s)} disabled={loading} aria-pressed={rsvp === s}
          className={`flex min-h-11 min-w-[100px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
            rsvp === s ? `${activeColor} border-transparent` : 'border-[var(--border-2)] text-[var(--text-2)] hover:border-[var(--border-2)] hover:text-[var(--text-1)]'
          }`}>
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  )
}
