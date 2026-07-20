'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'

export function PrivacySettingsForm({ settings }: { settings: { is_private: boolean; allow_dms: boolean; hide_win_rate: boolean } }) {
  const supabase = createClient()
  const [isPrivate, setIsPrivate] = useState(settings.is_private ?? false)
  const [allowDms, setAllowDms] = useState(settings.allow_dms ?? true)
  const [hideWinRate, setHideWinRate] = useState(settings.hide_win_rate ?? false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setError('')
    // "Saved!" previously showed regardless of whether the write actually
    // succeeded — for Private Account specifically, that meant someone
    // could believe their account was locked down (and post accordingly)
    // while it silently stayed fully public.
    const { error: err } = await supabase.from('users').update({ is_private: isPrivate, allow_dms: allowDms, hide_win_rate: hideWinRate }).eq('id', user.id)
    if (err) { setError('Could not save — please try again.'); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const toggleItems = [
    { label: 'Private Account', desc: 'Only your followers can see your posts, picks, and pick record — you\'re also removed from the public leaderboard. Your profile, username, and bio stay visible', value: isPrivate, set: setIsPrivate },
    { label: 'Hide Win Rate', desc: 'Hide your pick record and win rate from your public profile', value: hideWinRate, set: setHideWinRate },
    { label: 'Allow Direct Messages', desc: 'Anyone can send you a DM', value: allowDms, set: setAllowDms },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {toggleItems.map(s => (
          <div key={s.label} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-bold text-white">{s.label}</p>
              <p className="text-xs text-zinc-500">{s.desc}</p>
            </div>
            <button onClick={() => s.set(!s.value)}
              className={`relative w-11 h-6 rounded-full transition-colors ${s.value ? 'bg-green-500' : 'bg-zinc-700'}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${s.value ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={save} className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-black px-6 py-2.5 rounded-xl text-sm transition-colors">
        {saved ? <><Check size={13} /> Saved!</> : 'Save Privacy Settings'}
      </button>
    </div>
  )
}
