'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'

const SETTINGS = [
  { key: 'new_follower', label: 'New follower', desc: 'When someone follows you' },
  { key: 'post_reaction', label: 'Post reactions', desc: 'When someone likes your post' },
  { key: 'post_comment', label: 'Comments', desc: 'When someone comments on your post' },
  { key: 'repost', label: 'Reposts', desc: 'When someone reposts your pick' },
  { key: 'mention', label: 'Mentions', desc: 'When someone @mentions you' },
  { key: 'new_pick', label: 'New picks from people you follow', desc: 'When someone you follow posts a pick or parlay' },
  { key: 'pick_result', label: 'Pick results', desc: 'When a pick you shared gets graded' },
  { key: 'group_invite', label: 'Group invites', desc: 'When someone invites you to a group' },
  { key: 'dm', label: 'Direct messages', desc: 'When you receive a DM' },
  { key: 'subscription', label: 'Subscriptions', desc: 'New subscriber / subscription alerts' },
]

export function NotificationSettingsForm({ settings }: { settings: Record<string, boolean> }) {
  const supabase = createClient()
  const [values, setValues] = useState<Record<string, boolean>>(
    Object.fromEntries(SETTINGS.map(s => [s.key, settings[s.key] ?? true]))
  )
  const [saved, setSaved] = useState(false)

  async function save() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('users').update({ notification_settings: values }).eq('id', user.id)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {SETTINGS.map(s => (
          <div key={s.key} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-bold text-white">{s.label}</p>
              <p className="text-xs text-zinc-500">{s.desc}</p>
            </div>
            <button onClick={() => setValues(v => ({ ...v, [s.key]: !v[s.key] }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${values[s.key] ? 'bg-green-500' : 'bg-zinc-700'}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${values[s.key] ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={save} className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-black px-6 py-2.5 rounded-xl text-sm transition-colors">
        {saved ? <><Check size={13} /> Saved!</> : 'Save Preferences'}
      </button>
    </div>
  )
}
