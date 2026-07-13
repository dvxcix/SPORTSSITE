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

function Toggle({ on, onClick, size = 'md' }: { on: boolean; onClick: () => void; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 'w-9 h-5' : 'w-11 h-6'
  const knob = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const travel = size === 'sm' ? 'translate-x-4' : 'translate-x-5'
  return (
    <button onClick={onClick} className={`relative ${w} rounded-full transition-colors shrink-0 ${on ? 'bg-green-500' : 'bg-zinc-700'}`}>
      <span className={`absolute top-0.5 left-0.5 ${knob} bg-white rounded-full shadow transition-transform ${on ? travel : ''}`} />
    </button>
  )
}

// Two independent delivery channels per notification type — push (default
// ON, matches the always-on behavior most people expect for in-the-moment
// alerts) and email (default OFF, since most people don't want a mailbox
// full of "so-and-so reacted to your post"; explicitly opting in per type
// is the point). Stored flat in the same notification_settings jsonb:
// push under the bare key ("new_follower"), email under "<key>_email".
// This is entirely separate from transactional account emails (password
// changed, welcome, etc) — those aren't user-toggleable and aren't touched
// here.
export function NotificationSettingsForm({ settings }: { settings: Record<string, boolean> }) {
  const supabase = createClient()
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const s of SETTINGS) {
      init[s.key] = settings[s.key] ?? true
      init[`${s.key}_email`] = settings[`${s.key}_email`] ?? false
    }
    return init
  })
  const [saved, setSaved] = useState(false)

  async function save() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('users').update({ notification_settings: values }).eq('id', user.id)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  function setAll(suffix: '' | '_email', on: boolean) {
    setValues(v => {
      const next = { ...v }
      for (const s of SETTINGS) next[`${s.key}${suffix}`] = on
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setAll('', true)} className="text-xs font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
          Enable all push
        </button>
        <button onClick={() => setAll('', false)} className="text-xs font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
          Disable all push
        </button>
        <button onClick={() => setAll('_email', true)} className="text-xs font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
          Enable all email
        </button>
        <button onClick={() => setAll('_email', false)} className="text-xs font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
          Disable all email
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Notification</span>
          <div className="flex items-center gap-6">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider w-9 text-center">Push</span>
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider w-9 text-center">Email</span>
          </div>
        </div>
        {SETTINGS.map(s => (
          <div key={s.key} className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">{s.label}</p>
              <p className="text-xs text-zinc-500">{s.desc}</p>
            </div>
            <div className="flex items-center gap-6 shrink-0">
              <div className="w-9 flex justify-center">
                <Toggle size="sm" on={values[s.key]} onClick={() => setValues(v => ({ ...v, [s.key]: !v[s.key] }))} />
              </div>
              <div className="w-9 flex justify-center">
                <Toggle size="sm" on={values[`${s.key}_email`]} onClick={() => setValues(v => ({ ...v, [`${s.key}_email`]: !v[`${s.key}_email`] }))} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={save} className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-black px-6 py-2.5 rounded-xl text-sm transition-colors">
        {saved ? <><Check size={13} /> Saved!</> : 'Save Preferences'}
      </button>
    </div>
  )
}
