'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Switch as Toggle } from '@/components/ui/Switch'
import type { DiscordConfig } from '@/lib/supabase/types'

const ALERT_TYPES: { key: 'lineup_confirmed' | 'hr' | 'near_hr' | 'slate' | 'pipeline_health'; label: string; live: boolean }[] = [
  { key: 'lineup_confirmed', label: 'Lineup Confirmed / Changed', live: true },
  { key: 'hr', label: 'Home Run Alerts', live: true },
  { key: 'near_hr', label: 'Near-HR Alerts', live: true },
  { key: 'slate', label: "Today's Slate Drop", live: true },
  { key: 'pipeline_health', label: 'Data Pipeline Health (stale pitch log, etc.)', live: true },
]

const TIERS: { key: 'free' | 'basic' | 'advanced' | 'ultimate'; label: string }[] = [
  { key: 'free', label: 'Free' },
  { key: 'basic', label: 'Basic' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'ultimate', label: 'Ultimate' },
]

const inputClass = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 font-mono'

type ContactAlertHealth = {
  ready: boolean
  enabled: boolean
  channels: {
    hr: { configured: boolean; id: string | null }
    nearHr: { configured: boolean; id: string | null }
  }
  queue: { pending: number; processing: number; failed: number; succeeded: number }
  latestSuccessAt: string | null
  latestFailureAt: string | null
  recoverySchedule: string
  recent: Array<{
    id: string
    status: string
    attempts: number
    lastError: string | null
    createdAt: string
    completedAt: string | null
    latencyMs: number | null
    kind: string | null
    batterName: string | null
  }>
}

function compactTime(value: string | null) {
  if (!value) return 'None yet'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function compactLatency(value: number | null) {
  if (value == null) return '—'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} sec`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function DiscordBotManager({ initialConfig }: { initialConfig: DiscordConfig | null }) {
  const [guildId, setGuildId] = useState(initialConfig?.guild_id ?? '')
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? false)
  const [alertChannels, setAlertChannels] = useState<Record<string, string>>(initialConfig?.alert_channels ?? {})
  const [tierRoles, setTierRoles] = useState<Record<string, string>>(initialConfig?.tier_roles ?? {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [registering, setRegistering] = useState(false)
  const [registerResult, setRegisterResult] = useState('')
  const [syncingRoles, setSyncingRoles] = useState(false)
  const [syncRolesResult, setSyncRolesResult] = useState('')
  const [alertHealth, setAlertHealth] = useState<ContactAlertHealth | null>(null)
  const [alertHealthError, setAlertHealthError] = useState('')
  const [loadingAlertHealth, setLoadingAlertHealth] = useState(true)
  const [testingAlert, setTestingAlert] = useState<'hr' | 'near_hr' | null>(null)
  const [testResult, setTestResult] = useState('')
  const router = useRouter()

  async function loadAlertHealth() {
    setLoadingAlertHealth(true)
    setAlertHealthError('')
    try {
      const response = await fetch('/api/admin/discord/contact-alerts', { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'Could not load contact alert health')
      setAlertHealth(body as ContactAlertHealth)
    } catch (error: unknown) {
      setAlertHealthError(errorMessage(error, 'Could not load contact alert health'))
    } finally {
      setLoadingAlertHealth(false)
    }
  }

  useEffect(() => {
    let active = true
    fetch('/api/admin/discord/contact-alerts', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body?.error || 'Could not load contact alert health')
        return body as ContactAlertHealth
      })
      .then(body => { if (active) setAlertHealth(body) })
      .catch((error: unknown) => { if (active) setAlertHealthError(errorMessage(error, 'Could not load contact alert health')) })
      .finally(() => { if (active) setLoadingAlertHealth(false) })
    return () => { active = false }
  }, [])

  async function sendAlertTest(kind: 'hr' | 'near_hr') {
    const label = kind === 'hr' ? 'home-run' : 'near-home-run'
    if (!window.confirm(`Send one clearly labeled ${label} test to its configured Discord channel?`)) return
    setTestingAlert(kind)
    setTestResult('')
    try {
      const response = await fetch('/api/admin/discord/contact-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'Test delivery failed')
      const result = body.result as { messageId?: string; animated?: boolean; bytes?: number }
      setTestResult(`${kind === 'hr' ? 'HR' : 'Near-HR'} test delivered${result.messageId ? ` - message ${result.messageId}` : ''}${result.animated ? ' - animated GIF' : ' - PNG fallback'}.`)
      await loadAlertHealth()
    } catch (error: unknown) {
      setTestResult(`Test failed: ${errorMessage(error, 'Unknown error')}`)
    } finally {
      setTestingAlert(null)
    }
  }

  async function save() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/admin/discord/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId, enabled, alert_channels: alertChannels, tier_roles: tierRoles }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Save failed')
      setSaved(true)
      router.refresh()
      await loadAlertHealth()
      setTimeout(() => setSaved(false), 2000)
    } catch (error: unknown) {
      setError(errorMessage(error, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function registerCommands() {
    setRegistering(true)
    setRegisterResult('')
    try {
      const res = await fetch('/api/admin/discord/register-commands', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Registration failed')
      setRegisterResult(`Registered ${body.registered} command(s) — may take up to an hour to appear everywhere.`)
    } catch (error: unknown) {
      setRegisterResult(`Error: ${errorMessage(error, 'Registration failed')}`)
    } finally {
      setRegistering(false)
    }
  }

  async function syncAllRoles() {
    setSyncingRoles(true)
    setSyncRolesResult('')
    try {
      const res = await fetch('/api/admin/discord/sync-all-roles', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Sync failed')
      setSyncRolesResult(`Synced ${body.synced}/${body.total} linked member(s).${body.failed ? ` ${body.failed} failed — check server logs.` : ''}`)
    } catch (error: unknown) {
      setSyncRolesResult(`Error: ${errorMessage(error, 'Sync failed')}`)
    } finally {
      setSyncingRoles(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">One-time setup (do this first)</p>
        <ol className="text-sm text-zinc-400 space-y-1.5 list-decimal list-inside">
          <li>Create an app at <span className="font-mono text-zinc-300">discord.com/developers/applications</span>, add a Bot, copy its token.</li>
          <li>In Vercel, set env vars: <span className="font-mono text-zinc-300">DISCORD_BOT_TOKEN</span>, <span className="font-mono text-zinc-300">DISCORD_APPLICATION_ID</span>, <span className="font-mono text-zinc-300">DISCORD_PUBLIC_KEY</span>.</li>
          <li>In the app's "General Information" tab, set Interactions Endpoint URL to your site's <span className="font-mono text-zinc-300">/api/discord/interactions</span>.</li>
          <li>Invite the bot to your server with the <span className="font-mono text-zinc-300">bot</span> + <span className="font-mono text-zinc-300">applications.commands</span> scopes and Manage Roles / Send Messages / Embed Links permissions.</li>
          <li>Drag the bot's own role ABOVE any tier role below in Server Settings → Roles, or role grants will silently fail.</li>
          <li>Fill in the IDs below (Discord → enable Developer Mode → right-click a channel/role → Copy ID), then Save, then Register Commands.</li>
        </ol>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-zinc-400">Enabled</label>
          <Toggle checked={enabled} onChange={setEnabled} ariaLabel="Enable Discord bot" />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Server (Guild) ID</label>
          <input value={guildId} onChange={e => setGuildId(e.target.value)} placeholder="123456789012345678" className={inputClass} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top_right,rgba(163,255,63,0.10),transparent_34%),linear-gradient(135deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98))]">
        <div className="flex flex-col gap-3 border-b border-zinc-800/80 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${alertHealth?.ready ? 'bg-green-400 shadow-[0_0_14px_rgba(163,255,63,0.8)]' : 'bg-amber-400'}`} />
              <h2 className="text-base font-black text-white">Instant contact delivery</h2>
            </div>
            <p className="mt-1 text-xs text-zinc-400">Live feed wakeups, durable recovery, branded media render and checked Discord delivery.</p>
          </div>
          <button onClick={loadAlertHealth} disabled={loadingAlertHealth}
            className="self-start rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:border-zinc-500 disabled:opacity-50">
            {loadingAlertHealth ? 'Checking...' : 'Refresh health'}
          </button>
        </div>

        <div className="space-y-5 p-5">
          {alertHealthError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{alertHealthError}</div>}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Pending', alertHealth?.queue.pending ?? 0, 'text-amber-300'],
              ['Rendering', alertHealth?.queue.processing ?? 0, 'text-cyan-300'],
              ['Failed', alertHealth?.queue.failed ?? 0, 'text-red-300'],
              ['Delivered', alertHealth?.queue.succeeded ?? 0, 'text-green-300'],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                <div className={`text-xl font-black ${color}`}>{value}</div>
                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-white">Home runs</p>
                  <p className="mt-1 text-xs text-zinc-500">Channel {alertHealth?.channels.hr.id ?? 'not configured'}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${alertHealth?.channels.hr.configured ? 'bg-green-400/10 text-green-300' : 'bg-amber-400/10 text-amber-300'}`}>
                  {alertHealth?.channels.hr.configured ? 'Ready' : 'Missing'}
                </span>
              </div>
              <button onClick={() => sendAlertTest('hr')} disabled={testingAlert !== null || !alertHealth?.channels.hr.configured}
                className="mt-4 w-full rounded-lg bg-green-400 px-3 py-2.5 text-xs font-black text-black transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-35">
                {testingAlert === 'hr' ? 'Rendering and sending...' : 'Send HR test'}
              </button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-white">Near home runs</p>
                  <p className="mt-1 text-xs text-zinc-500">Channel {alertHealth?.channels.nearHr.id ?? 'not configured'}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${alertHealth?.channels.nearHr.configured ? 'bg-orange-400/10 text-orange-300' : 'bg-amber-400/10 text-amber-300'}`}>
                  {alertHealth?.channels.nearHr.configured ? 'Ready' : 'Missing'}
                </span>
              </div>
              <button onClick={() => sendAlertTest('near_hr')} disabled={testingAlert !== null || !alertHealth?.channels.nearHr.configured}
                className="mt-4 w-full rounded-lg bg-orange-400 px-3 py-2.5 text-xs font-black text-black transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-35">
                {testingAlert === 'near_hr' ? 'Rendering and sending...' : 'Send near-HR test'}
              </button>
            </div>
          </div>

          {testResult && <div className={`rounded-xl border px-4 py-3 text-xs ${testResult.startsWith('Test failed') ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-green-500/20 bg-green-500/10 text-green-200'}`}>{testResult}</div>}

          <div className="rounded-xl border border-zinc-800 bg-black/20">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-white">Recent deliveries</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">Latest success {compactTime(alertHealth?.latestSuccessAt ?? null)} - recovery {alertHealth?.recoverySchedule ?? 'every minute'}</p>
              </div>
            </div>
            <div className="divide-y divide-zinc-800/80">
              {(alertHealth?.recent ?? []).slice(0, 6).map(row => (
                <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-xs sm:grid-cols-[1fr_100px_80px] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-zinc-200">{row.batterName ?? 'Contact alert'} - {row.kind === 'home_run' ? 'HR' : row.kind === 'near_hr' ? 'Near-HR' : 'Alert'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">{compactTime(row.createdAt)}{row.lastError ? ` - ${row.lastError}` : ''}</p>
                  </div>
                  <span className={`justify-self-end rounded-full px-2 py-1 text-[10px] font-black uppercase ${row.status === 'succeeded' ? 'bg-green-400/10 text-green-300' : row.status === 'failed' ? 'bg-red-400/10 text-red-300' : 'bg-amber-400/10 text-amber-300'}`}>{row.status}</span>
                  <span className="hidden text-right font-mono text-zinc-400 sm:block">{compactLatency(row.latencyMs)}</span>
                </div>
              ))}
              {!loadingAlertHealth && !(alertHealth?.recent.length) && <div className="px-4 py-6 text-center text-xs text-zinc-500">No contact alerts have been queued yet.</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Alert Channels</p>
        {ALERT_TYPES.map(a => (
          <div key={a.key}>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">
              {a.label} {!a.live && <span className="text-zinc-600 font-normal">(mapping ready — wiring in a fast follow)</span>}
            </label>
            <input
              value={alertChannels[a.key] ?? ''}
              onChange={e => setAlertChannels(prev => ({ ...prev, [a.key]: e.target.value }))}
              placeholder="Channel ID"
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tier → Role Sync</p>
        {TIERS.map(t => (
          <div key={t.key}>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">{t.label} role</label>
            <input
              value={tierRoles[t.key] ?? ''}
              onChange={e => setTierRoles(prev => ({ ...prev, [t.key]: e.target.value }))}
              placeholder="Role ID"
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={saving}
          className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-5 py-2.5 rounded-xl text-sm transition-colors">
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Config'}
        </button>
        <button onClick={registerCommands} disabled={registering}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors border border-zinc-700">
          {registering ? 'Registering…' : 'Register Slash Commands'}
        </button>
        {registerResult && <span className="text-xs text-zinc-400">{registerResult}</span>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={syncAllRoles} disabled={syncingRoles}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors border border-zinc-700">
          {syncingRoles ? 'Syncing…' : 'Sync All Member Roles'}
        </button>
        <span className="text-xs text-zinc-500">One-time (or run-whenever) backfill for members who linked Discord before role sync went live.</span>
        {syncRolesResult && <span className="text-xs text-zinc-400">{syncRolesResult}</span>}
      </div>
    </div>
  )
}
