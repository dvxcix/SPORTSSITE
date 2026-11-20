'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Switch as Toggle } from '@/components/ui/Switch'
import type { DiscordConfig } from '@/lib/supabase/types'
import { useFeedback } from '@/components/ui/FeedbackProvider'

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

const inputClass = 'w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)] font-mono'

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
  const [slateCommand, setSlateCommand] = useState<{ slateId: string | null; otherCount: number } | null>(null)
  const [slateChecking, setSlateChecking] = useState(false)
  const [slateMessage, setSlateMessage] = useState('')
  const [syncingRoles, setSyncingRoles] = useState(false)
  const [syncRolesResult, setSyncRolesResult] = useState('')
  const [alertHealth, setAlertHealth] = useState<ContactAlertHealth | null>(null)
  const [alertHealthError, setAlertHealthError] = useState('')
  const [loadingAlertHealth, setLoadingAlertHealth] = useState(true)
  const [testingAlert, setTestingAlert] = useState<'hr' | 'near_hr' | null>(null)
  const [testResult, setTestResult] = useState('')
  const router = useRouter()
  const { confirm } = useFeedback()

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
    if (!await confirm({
      title: `Send ${label} test?`,
      message: 'One clearly labeled test alert will be sent to the configured Discord channel.',
      confirmLabel: 'Send test',
    })) return
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

  async function inspectSlate() {
    setSlateChecking(true)
    setSlateMessage('')
    setSlateCommand(null)
    try {
      const response = await fetch('/api/admin/discord/slate-command', { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Inspection failed')
      setSlateCommand(body)
    } catch (error: unknown) { setSlateMessage(errorMessage(error, 'Inspection failed')) }
    finally { setSlateChecking(false) }
  }

  async function removeSlate() {
    if (!slateCommand?.slateId) return
    setSlateChecking(true)
    setSlateMessage('')
    try {
      const response = await fetch('/api/admin/discord/slate-command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedId: slateCommand.slateId }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Removal was not confirmed')
      setSlateCommand({ slateId: null, otherCount: body.otherCount })
      setSlateMessage('The MLB slate command was removed; other command identities were unchanged.')
    } catch (error: unknown) {
      setSlateCommand(null)
      setSlateMessage(errorMessage(error, 'Removal was not confirmed. Inspect again.'))
    } finally { setSlateChecking(false) }
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
      {error && <div className="bg-[color-mix(in_srgb,var(--red)_10%,transparent)] border border-[color-mix(in_srgb,var(--red)_20%,transparent)] rounded-xl px-4 py-3 text-sm text-[var(--red)]">{error}</div>}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
        <p className="text-sm font-bold text-[var(--text-1)]">MLB slate command</p>
        <p className="text-xs text-[var(--text-2)]">Inspect the global command list, then remove only the MLB slate command. Two-factor verification is required.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={inspectSlate} disabled={slateChecking} className="rounded-lg border border-[var(--border-2)] px-3 py-2 text-xs font-bold text-[var(--text-1)] disabled:opacity-50">{slateChecking ? 'Checking…' : 'Inspect command'}</button>
          {slateCommand?.slateId && <button type="button" onClick={removeSlate} disabled={slateChecking} className="rounded-lg border border-[var(--gold)] px-3 py-2 text-xs font-bold text-[var(--gold)] disabled:opacity-50">Remove MLB slate</button>}
        </div>
        {slateCommand && <p className="text-xs text-[var(--text-2)]">{slateCommand.slateId ? 'MLB slate is registered.' : 'MLB slate is not registered.'} {slateCommand.otherCount} other commands found.</p>}
        {slateMessage && <p role="status" className="text-xs text-[var(--text-2)]">{slateMessage}</p>}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">One-time setup (do this first)</p>
        <ol className="text-sm text-[var(--text-2)] space-y-1.5 list-decimal list-inside">
          <li>Create an app at <span className="font-mono text-[var(--text-2)]">discord.com/developers/applications</span>, add a Bot, copy its token.</li>
          <li>In Vercel, set env vars: <span className="font-mono text-[var(--text-2)]">DISCORD_BOT_TOKEN</span>, <span className="font-mono text-[var(--text-2)]">DISCORD_APPLICATION_ID</span>, <span className="font-mono text-[var(--text-2)]">DISCORD_PUBLIC_KEY</span>.</li>
          <li>In the app's "General Information" tab, set Interactions Endpoint URL to your site's <span className="font-mono text-[var(--text-2)]">/api/discord/interactions</span>.</li>
          <li>Invite the bot to your server with the <span className="font-mono text-[var(--text-2)]">bot</span> + <span className="font-mono text-[var(--text-2)]">applications.commands</span> scopes and Manage Roles / Send Messages / Embed Links permissions.</li>
          <li>Drag the bot's own role ABOVE any tier role below in Server Settings → Roles, or role grants will silently fail.</li>
          <li>Fill in the IDs below (Discord → enable Developer Mode → right-click a channel/role → Copy ID), then Save, then Register Commands.</li>
        </ol>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-[var(--text-2)]">Enabled</label>
          <Toggle checked={enabled} onChange={setEnabled} ariaLabel="Enable Discord bot" />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Server (Guild) ID</label>
          <input value={guildId} onChange={e => setGuildId(e.target.value)} placeholder="123456789012345678" className={inputClass} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-col gap-3 border-b border-[color-mix(in_srgb,var(--border)_80%,transparent)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${alertHealth?.ready ? 'bg-[var(--green-fill)] shadow-[0_0_14px_rgba(163,255,63,0.8)]' : 'bg-[var(--gold-fill)]'}`} />
              <h2 className="text-base font-semibold text-[var(--text-1)]">Instant contact delivery</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--text-2)]">Live feed wakeups, durable recovery, branded media render and checked Discord delivery.</p>
          </div>
          <button onClick={loadAlertHealth} disabled={loadingAlertHealth}
            className="self-start rounded-lg border border-[var(--border-2)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-3 py-2 text-xs font-bold text-[var(--text-1)] transition hover:border-[var(--border-2)] disabled:opacity-50">
            {loadingAlertHealth ? 'Checking...' : 'Refresh health'}
          </button>
        </div>

        <div className="space-y-5 p-5">
          {alertHealthError && <div className="rounded-xl border border-[color-mix(in_srgb,var(--red)_20%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3 text-sm text-[var(--red)]">{alertHealthError}</div>}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Pending', alertHealth?.queue.pending ?? 0, 'text-[var(--gold)]'],
              ['Rendering', alertHealth?.queue.processing ?? 0, 'text-cyan-300'],
              ['Failed', alertHealth?.queue.failed ?? 0, 'text-[var(--red)]'],
              ['Delivered', alertHealth?.queue.succeeded ?? 0, 'text-[var(--green)]'],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className={`text-xl font-semibold ${color}`}>{value}</div>
                <div className="mt-0.5 text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-3)]">{label}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-1)]">Home runs</p>
                  <p className="mt-1 text-xs text-[var(--text-3)]">Channel {alertHealth?.channels.hr.id ?? 'not configured'}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[12px] font-semibold uppercase ${alertHealth?.channels.hr.configured ? 'bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-[var(--green)]' : 'bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] text-[var(--gold)]'}`}>
                  {alertHealth?.channels.hr.configured ? 'Ready' : 'Missing'}
                </span>
              </div>
              <button onClick={() => sendAlertTest('hr')} disabled={testingAlert !== null || !alertHealth?.channels.hr.configured}
                className="mt-4 w-full rounded-lg bg-[var(--accent-fill)] px-3 py-2.5 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-fill)] disabled:cursor-not-allowed disabled:opacity-35">
                {testingAlert === 'hr' ? 'Rendering and sending...' : 'Send HR test'}
              </button>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-1)]">Near home runs</p>
                  <p className="mt-1 text-xs text-[var(--text-3)]">Channel {alertHealth?.channels.nearHr.id ?? 'not configured'}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[12px] font-semibold uppercase ${alertHealth?.channels.nearHr.configured ? 'bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] text-[var(--gold)]' : 'bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] text-[var(--gold)]'}`}>
                  {alertHealth?.channels.nearHr.configured ? 'Ready' : 'Missing'}
                </span>
              </div>
              <button onClick={() => sendAlertTest('near_hr')} disabled={testingAlert !== null || !alertHealth?.channels.nearHr.configured}
                className="mt-4 w-full rounded-lg bg-[var(--gold-fill)] px-3 py-2.5 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--gold-fill)] disabled:cursor-not-allowed disabled:opacity-35">
                {testingAlert === 'near_hr' ? 'Rendering and sending...' : 'Send near-HR test'}
              </button>
            </div>
          </div>

          {testResult && <div className={`rounded-xl border px-4 py-3 text-xs ${testResult.startsWith('Test failed') ? 'border-[color-mix(in_srgb,var(--red)_20%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] text-[var(--red)]' : 'border-[color-mix(in_srgb,var(--green)_20%,transparent)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-[var(--green)]'}`}>{testResult}</div>}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-1)]">Recent deliveries</p>
                <p className="mt-0.5 text-[12px] text-[var(--text-3)]">Latest success {compactTime(alertHealth?.latestSuccessAt ?? null)} - recovery {alertHealth?.recoverySchedule ?? 'every minute'}</p>
              </div>
            </div>
            <div className="divide-y divide-[color-mix(in_srgb,var(--border)_80%,transparent)]">
              {(alertHealth?.recent ?? []).slice(0, 6).map(row => (
                <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-xs sm:grid-cols-[1fr_100px_80px] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[var(--text-1)]">{row.batterName ?? 'Contact alert'} - {row.kind === 'home_run' ? 'HR' : row.kind === 'near_hr' ? 'Near-HR' : 'Alert'}</p>
                    <p className="mt-0.5 truncate text-[12px] text-[var(--text-3)]">{compactTime(row.createdAt)}{row.lastError ? ` - ${row.lastError}` : ''}</p>
                  </div>
                  <span className={`justify-self-end rounded-full px-2 py-1 text-[12px] font-semibold uppercase ${row.status === 'succeeded' ? 'bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-[var(--green)]' : row.status === 'failed' ? 'bg-[color-mix(in_srgb,var(--red)_10%,transparent)] text-[var(--red)]' : 'bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] text-[var(--gold)]'}`}>{row.status}</span>
                  <span className="hidden text-right font-mono text-[var(--text-2)] sm:block">{compactLatency(row.latencyMs)}</span>
                </div>
              ))}
              {!loadingAlertHealth && !(alertHealth?.recent.length) && <div className="px-4 py-6 text-center text-xs text-[var(--text-3)]">No contact alerts have been queued yet.</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-4">
        <p className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Alert Channels</p>
        {ALERT_TYPES.map(a => (
          <div key={a.key}>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">
              {a.label} {!a.live && <span className="text-[var(--text-3)] font-normal">(mapping ready — wiring in a fast follow)</span>}
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

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-4">
        <p className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Tier → Role Sync</p>
        {TIERS.map(t => (
          <div key={t.key}>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">{t.label} role</label>
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
          className="bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] disabled:opacity-40 text-[var(--accent-fg)] font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Config'}
        </button>
        <button onClick={registerCommands} disabled={registering}
          className="bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-40 text-[var(--text-1)] font-bold px-5 py-2.5 rounded-xl text-sm transition-colors border border-[var(--border-2)]">
          {registering ? 'Registering…' : 'Register Slash Commands'}
        </button>
        {registerResult && <span className="text-xs text-[var(--text-2)]">{registerResult}</span>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={syncAllRoles} disabled={syncingRoles}
          className="bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-40 text-[var(--text-1)] font-bold px-5 py-2.5 rounded-xl text-sm transition-colors border border-[var(--border-2)]">
          {syncingRoles ? 'Syncing…' : 'Sync All Member Roles'}
        </button>
        <span className="text-xs text-[var(--text-3)]">One-time (or run-whenever) backfill for members who linked Discord before role sync went live.</span>
        {syncRolesResult && <span className="text-xs text-[var(--text-2)]">{syncRolesResult}</span>}
      </div>
    </div>
  )
}
