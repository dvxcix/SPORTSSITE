'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'
import { Switch } from '@/components/ui/Switch'

export function PrivacySettingsForm({ settings }: { settings: { is_private: boolean; allow_dms: boolean; hide_win_rate: boolean } }) {
  const supabase = useMemo(() => createClient(), [])
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
      <div className="ss-settings-list">
        {toggleItems.map(s => (
          <div key={s.label} className="ss-settings-row">
            <div className="ss-settings-row-copy"><strong>{s.label}</strong><small>{s.desc}</small></div>
            <Switch checked={s.value} onChange={s.set} ariaLabel={s.label} />
          </div>
        ))}
      </div>
      {error && <p role="alert" className="ss-settings-feedback">{error}</p>}
      <button type="button" onClick={save} className="ss-settings-primary">
        {saved ? <><Check size={13} /> Saved</> : 'Save privacy settings'}
      </button>
    </div>
  )
}
