'use client'

import { useState } from 'react'
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
  const router = useRouter()

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
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e?.message ?? 'Save failed')
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
    } catch (e: any) {
      setRegisterResult(`Error: ${e?.message ?? 'Registration failed'}`)
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
    } catch (e: any) {
      setSyncRolesResult(`Error: ${e?.message ?? 'Sync failed'}`)
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
          <Toggle checked={enabled} onChange={setEnabled} label="" />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Server (Guild) ID</label>
          <input value={guildId} onChange={e => setGuildId(e.target.value)} placeholder="123456789012345678" className={inputClass} />
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
