'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'Golf', 'Tennis', 'Boxing', 'College Football', 'College Basketball']

export function ProfileForm({ profile }: { profile: any }) {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({
    display_name: profile?.display_name ?? '',
    username: profile?.username ?? '',
    bio: profile?.bio ?? '',
    location: profile?.location ?? '',
    website: profile?.website ?? '',
    avatar_url: profile?.avatar_url ?? '',
    banner_url: profile?.banner_url ?? '',
    favorite_sports: (profile?.favorite_sports ?? []) as string[],
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function toggleSport(s: string) {
    setForm(f => ({
      ...f,
      favorite_sports: f.favorite_sports.includes(s)
        ? f.favorite_sports.filter(x => x !== s)
        : [...f.favorite_sports, s],
    }))
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const username = form.username.trim().toLowerCase().replace(/\s/g, '')
      if (!username) { setError('Username cannot be empty'); return }

      const { error: err } = await supabase.from('users').update({
        display_name: form.display_name.trim() || null,
        username,
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
        website: form.website.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        banner_url: form.banner_url.trim() || null,
        favorite_sports: form.favorite_sports,
      }).eq('id', profile.id)
      if (err) { setError(err.message); return }
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Something went wrong saving your profile — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-2xl bg-zinc-700 overflow-hidden flex items-center justify-center text-3xl">
          {form.avatar_url ? <img src={form.avatar_url} alt="" className="w-full h-full object-cover" /> : (form.display_name || '?')[0]?.toUpperCase()}
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Avatar URL</label>
          <input value={form.avatar_url} onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} placeholder="https://…" className={inputClass} />
          <p className="text-xs text-zinc-600 mt-1">Direct image URL (jpg, png, webp)</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-1.5">Banner URL</label>
        <input value={form.banner_url} onChange={e => setForm(f => ({ ...f, banner_url: e.target.value }))} placeholder="https://…" className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Display Name</label>
          <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Your name" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Username</label>
          <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} placeholder="username" className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-1.5">Bio</label>
        <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={3} placeholder="Tell people who you are…" className={inputClass + ' resize-none'} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Location</label>
          <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="City, State" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Website</label>
          <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Favorite Sports</label>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map(s => (
            <button key={s} type="button" onClick={() => toggleSport(s)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${form.favorite_sports.includes(s) ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
              {form.favorite_sports.includes(s) && <Check size={10} />}{s}
            </button>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className={`w-full flex items-center justify-center gap-2 font-black py-3 rounded-xl transition-all ${saved ? 'bg-green-600 text-white' : 'bg-green-500 hover:bg-green-400 text-black'} disabled:opacity-60`}>
        {saved ? <><Check size={16} /> Saved!</> : saving ? 'Saving…' : 'Save Profile'}
      </button>
    </div>
  )
}
