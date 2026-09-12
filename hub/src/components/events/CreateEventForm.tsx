'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { sportLogoUrl } from '@/lib/sportLogos'
import { Switch } from '@/components/ui/Switch'
import Image from 'next/image'
import { ArrowRight, Loader2 } from 'lucide-react'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'General']

export function CreateEventForm({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({
    title: '', description: '', location: '', start_date: '', end_date: '', sport: '', is_online: false, link: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!form.title.trim() || !form.start_date) { setError('Title and start date are required'); return }
    if (form.end_date && new Date(form.end_date) <= new Date(form.start_date)) { setError('End time must be after the start time'); return }
    if (form.is_online && !form.link.trim()) { setError('Add the event link for an online event'); return }
    if (form.is_online && form.link.trim()) {
      try {
        const url = new URL(form.link.trim())
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol')
      } catch {
        setError('Enter a valid event link beginning with https://')
        return
      }
    }
    setSubmitting(true)
    setError('')
    const { data, error: err } = await supabase.from('events').insert({
      host_id: userId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      sport: form.sport || null,
      is_online: form.is_online,
      link: form.is_online ? form.link.trim() : null,
      going_count: 0,
      interested_count: 0,
    }).select('id').single()
    if (err) { setError('The event could not be created. Try again.'); setSubmitting(false); return }
    router.push(`/events/${data?.id}`)
  }

  const inputClass = "ss-flow-input"

  return (
    <form className="ss-flow-form" onSubmit={create}>
      {error && <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="ss-flow-card">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Event Title *</label>
          <input aria-label="Event title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Yankees Watch Party, NFL Draft Night…" maxLength={100} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Description</label>
          <textarea aria-label="Event description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} maxLength={1000} className={inputClass + ' resize-none'} placeholder="What's happening?" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Start Date & Time *</label>
            <input type="datetime-local" aria-label="Event start date and time" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">End Date & Time</label>
            <input type="datetime-local" aria-label="Event end date and time" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Location</label>
          <input aria-label="Event location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Address or venue name" className={inputClass} />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[.07] bg-black/20 p-3.5">
          <div><p className="text-sm font-bold text-white">Online event</p><p className="mt-0.5 text-xs text-zinc-500">Show a join link on the event page</p></div>
          <Switch checked={form.is_online} onChange={checked => setForm(f => ({ ...f, is_online: checked }))} ariaLabel="Online event" />
        </div>
        {form.is_online && <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Event Link *</label>
          <input type="url" aria-label="Event link" value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="https://…" maxLength={500} className={inputClass} />
        </div>}
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Sport</label>
          <div className="flex flex-wrap gap-1.5">
            {SPORTS.map(s => {
              const logo = sportLogoUrl(s)
              return (
                <button key={s} type="button" onClick={() => setForm(f => ({ ...f, sport: s === 'General' ? '' : s }))}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border transition-all ${(form.sport === s || (s === 'General' && !form.sport)) ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                  {logo && <Image src={logo} alt="" width={14} height={14} className="object-contain" />}
                  {s}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <button type="submit" disabled={submitting || !form.title.trim() || !form.start_date} className="ss-flow-submit">
        {submitting ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : <>Create event <ArrowRight size={16} /></>}
      </button>
    </form>
  )
}
