'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, Star, X } from 'lucide-react'

type RSVPStatus = 'going' | 'interested' | 'not_going' | null

export function EventRSVPButtons({ userId, eventId, initialRsvp }: {
  userId: string; eventId: string; initialRsvp: string | null
}) {
  const [rsvp, setRsvp] = useState<RSVPStatus>(initialRsvp as RSVPStatus)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function select(status: RSVPStatus) {
    setLoading(true)
    if (rsvp === status) {
      await supabase.from('event_rsvps').delete().match({ user_id: userId, event_id: eventId })
      setRsvp(null)
    } else {
      await supabase.from('event_rsvps').upsert({ user_id: userId, event_id: eventId, status }, { onConflict: 'user_id,event_id' })
      setRsvp(status)
    }
    setLoading(false)
  }

  return (
    <div className="flex gap-2">
      {([
        { s: 'going' as const, label: "I'm Going", icon: Check, activeColor: 'bg-green-500 text-black' },
        { s: 'interested' as const, label: 'Interested', icon: Star, activeColor: 'bg-yellow-500 text-black' },
        { s: 'not_going' as const, label: "Can't Go", icon: X, activeColor: 'bg-zinc-600 text-white' },
      ]).map(({ s, label, icon: Icon, activeColor }) => (
        <button key={s} onClick={() => select(s)} disabled={loading}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60 border ${
            rsvp === s ? `${activeColor} border-transparent` : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'
          }`}>
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  )
}
