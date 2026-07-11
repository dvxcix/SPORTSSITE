'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'General']

export function CreateEventForm({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({
    title: '', description: '', location: '', start_date: '', end_date: '', sport: '', is_online: false, link: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    if (!form.title.trim() || !form.start_date) { setError('Title and start date are required'); return }
    setSubmitting(true)
    const { data, error: err } = await supabase.from('events').insert({
      host_id: userId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      sport: form.sport || null,
      is_online: form.is_online,
      link: form.link.trim() || null,
      going_count: 0,
      interested_count: 0,
    }).select('id').single()
    if (err) { setError(err.message); setSubmitting(false); return }
    router.push(`/events/${data?.id}`)
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Event Title *</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Yankees Watch Party, NFL Draft Night…" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inputClass + ' resize-none'} placeholder="What's happening?" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Start Date & Time *</label>
            <input type="datetime-local" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">End Date & Time</label>
            <input type="datetime-local" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Location</label>
          <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Address or venue name" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Online Link</label>
          <input value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="Discord, Zoom, Twitch URL…" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Sport</label>
          <div className="flex flex-wrap gap-1.5">
            {SPORTS.map(s => (
              <button key={s} type="button" onClick={() => setForm(f => ({ ...f, sport: s === 'General' ? '' : s }))}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${(form.sport === s || (s === 'General' && !form.sport)) ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={create} disabled={submitting || !form.title.trim() || !form.start_date}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-3 rounded-xl transition-colors">
        {submitting ? 'Creating…' : 'Create Event'}
      </button>
    </div>
  )
}
