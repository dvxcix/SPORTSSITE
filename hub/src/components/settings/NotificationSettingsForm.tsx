'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'
import { Switch } from '@/components/ui/Switch'
import type { NotificationDeliverySettings } from '@/lib/notificationDelivery'

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
  { key: 'lineup_confirmed', label: 'Lineup confirmed', desc: 'When a favorite team’s starting lineup is confirmed for today' },
]

// Two independent delivery channels per notification type — push (default
// ON, matches the always-on behavior most people expect for in-the-moment
// alerts) and email (default OFF, since most people don't want a mailbox
// full of "so-and-so reacted to your post"; explicitly opting in per type
// is the point). Stored flat in the same notification_settings jsonb:
// push under the bare key ("new_follower"), email under "<key>_email".
// This is entirely separate from transactional account emails (password
// changed, welcome, etc) — those aren't user-toggleable and aren't touched
// here.
const TIMEZONES = [
  ['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'],
  ['America/Los_Angeles', 'Pacific'], ['America/Phoenix', 'Arizona'], ['America/Anchorage', 'Alaska'], ['Pacific/Honolulu', 'Hawaii'],
] as const

export function NotificationSettingsForm({ settings, deliverySettings }: { settings: Record<string, boolean>; deliverySettings: NotificationDeliverySettings }) {
  const supabase = useMemo(() => createClient(), [])
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const s of SETTINGS) {
      init[s.key] = settings[s.key] ?? true
      init[`${s.key}_email`] = settings[`${s.key}_email`] ?? false
    }
    return init
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [delivery, setDelivery] = useState<NotificationDeliverySettings>({
    quiet_hours_enabled: deliverySettings.quiet_hours_enabled ?? false,
    quiet_start: deliverySettings.quiet_start ?? '22:00',
    quiet_end: deliverySettings.quiet_end ?? '07:00',
    timezone: deliverySettings.timezone ?? 'America/New_York',
    live_game_priority: deliverySettings.live_game_priority ?? true,
  })

  async function save() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setError('')
    const { error: err } = await supabase.from('users').update({ notification_settings: values, notification_delivery_settings: delivery }).eq('id', user.id)
    if (err) { setError('Could not save — please try again.'); return }
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
      <section className="ss-notification-delivery" aria-labelledby="delivery-timing-heading">
        <header><div><h2 id="delivery-timing-heading">Delivery timing</h2><p>Pause non-game push and email alerts on your schedule.</p></div><Switch checked={delivery.quiet_hours_enabled ?? false} onChange={checked => setDelivery(current => ({ ...current, quiet_hours_enabled: checked }))} ariaLabel="Quiet hours"/></header>
        <div className="ss-notification-time-grid">
          <label><span>Start</span><input type="time" value={delivery.quiet_start} onChange={event => setDelivery(current => ({ ...current, quiet_start: event.target.value }))}/></label>
          <label><span>End</span><input type="time" value={delivery.quiet_end} onChange={event => setDelivery(current => ({ ...current, quiet_end: event.target.value }))}/></label>
          <label><span>Time zone</span><select value={delivery.timezone} onChange={event => setDelivery(current => ({ ...current, timezone: event.target.value }))}>{TIMEZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="ss-notification-priority"><div><strong>Keep game alerts live</strong><small>Game-linked alerts can still arrive during quiet hours.</small></div><Switch checked={delivery.live_game_priority ?? true} onChange={checked => setDelivery(current => ({ ...current, live_game_priority: checked }))} ariaLabel="Keep game alerts live"/></div>
      </section>
      <div className="ss-settings-actions">
        <button type="button" onClick={() => setAll('', true)} className="ss-settings-secondary">
          Enable all push
        </button>
        <button type="button" onClick={() => setAll('', false)} className="ss-settings-secondary">
          Disable all push
        </button>
        <button type="button" onClick={() => setAll('_email', true)} className="ss-settings-secondary">
          Enable all email
        </button>
        <button type="button" onClick={() => setAll('_email', false)} className="ss-settings-secondary">
          Disable all email
        </button>
      </div>

      <div className="ss-settings-list">
        <div className="ss-settings-table-head"><span>Notification</span><span>Push</span><span>Email</span></div>
        {SETTINGS.map(s => (
          <div key={s.key} className="ss-settings-row">
            <div className="ss-settings-row-copy"><strong>{s.label}</strong><small>{s.desc}</small></div>
            <div className="flex shrink-0 items-center gap-[22px]">
              <div className="flex w-10 justify-center">
                <Switch size="sm" checked={values[s.key]} onChange={checked => setValues(v => ({ ...v, [s.key]: checked }))} ariaLabel={`${s.label} push notifications`} />
              </div>
              <div className="flex w-10 justify-center">
                <Switch size="sm" checked={values[`${s.key}_email`]} onChange={checked => setValues(v => ({ ...v, [`${s.key}_email`]: checked }))} ariaLabel={`${s.label} email notifications`} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="ss-settings-feedback">{error}</p>}
      <button type="button" onClick={save} className="ss-settings-primary">
        {saved ? <><Check size={13} /> Saved</> : 'Save preferences'}
      </button>
    </div>
  )
}
