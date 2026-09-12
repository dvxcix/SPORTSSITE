'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, LoaderCircle, Save, ShieldCheck, UsersRound } from 'lucide-react'
import { FEATURE_FLAGS, type FeatureFlagKey, type FeatureRollout, type FeatureRolloutAudience } from '@/lib/featureFlags'
import styles from './FeatureRolloutManager.module.css'

const LABELS: Record<FeatureFlagKey, string> = {
  feature_marketplace: 'Marketplace', feature_pages: 'Pages', feature_blog: 'Blog / Articles', feature_forum: 'Forum',
  feature_groups: 'Groups', feature_events: 'Events', feature_stories: 'Stories', feature_polls: 'Polls', feature_watchlist: 'Dugout Watchlist',
}
const AUDIENCES: { value: FeatureRolloutAudience; label: string }[] = [
  { value: 'off', label: 'Off' }, { value: 'admins', label: 'Admins' }, { value: 'members', label: 'Signed-in members' },
  { value: 'percentage', label: 'Staged cohort' }, { value: 'everyone', label: 'Everyone' },
]

type Editable = Pick<FeatureRollout, 'feature_key' | 'audience' | 'rollout_percent'>

export function FeatureRolloutManager() {
  const defaults = useMemo(() => Object.values(FEATURE_FLAGS).map(feature_key => ({ feature_key, audience: 'everyone' as const, rollout_percent: 100 })), [])
  const [rows, setRows] = useState<Editable[]>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<FeatureFlagKey | null>(null)
  const [saved, setSaved] = useState<FeatureFlagKey | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/admin/feature-rollouts', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Feature controls are unavailable.')
      return response.json() as Promise<{ rollouts: FeatureRollout[] }>
    }).then(body => {
      if (!active) return
      const found = new Map(body.rollouts.map(row => [row.feature_key, row]))
      setRows(defaults.map(row => found.get(row.feature_key) ?? row))
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Feature controls are unavailable.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [defaults])

  function update(key: FeatureFlagKey, patch: Partial<Editable>) {
    setRows(current => current.map(row => row.feature_key === key ? { ...row, ...patch } : row))
  }

  async function save(row: Editable) {
    setSaving(row.feature_key); setSaved(null); setError('')
    try {
      const response = await fetch('/api/admin/feature-rollouts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ featureKey: row.feature_key, audience: row.audience, rolloutPercent: row.rollout_percent }) })
      const body = await response.json().catch(() => null) as { rollout?: FeatureRollout; error?: string } | null
      if (!response.ok || !body?.rollout) throw new Error(body?.error || 'The rollout could not be saved.')
      update(row.feature_key, body.rollout)
      setSaved(row.feature_key)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The rollout could not be saved.') }
    finally { setSaving(null) }
  }

  if (loading) return <div className={styles.loading}><LoaderCircle aria-hidden="true" /> Loading feature controls…</div>

  return <div className={styles.shell}>
    <header><div><span>RELEASE CONTROL</span><h1>Feature rollouts</h1><p>Release features to staff, members, a stable cohort, or everyone.</p></div><ShieldCheck aria-hidden="true" /></header>
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    <div className={styles.grid}>
      {rows.map(row => <article key={row.feature_key}>
        <div className={styles.title}><div><strong>{LABELS[row.feature_key]}</strong><small>{row.feature_key}</small></div><UsersRound aria-hidden="true" /></div>
        <label>Audience<select value={row.audience} onChange={event => update(row.feature_key, { audience: event.target.value as FeatureRolloutAudience })}>{AUDIENCES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {row.audience === 'percentage' ? <label>Cohort <output>{row.rollout_percent}%</output><input type="range" min="1" max="99" value={row.rollout_percent} onChange={event => update(row.feature_key, { rollout_percent: Number(event.target.value) })} /></label> : null}
        <button type="button" onClick={() => save(row)} disabled={saving === row.feature_key}>{saving === row.feature_key ? <LoaderCircle className={styles.spin} /> : saved === row.feature_key ? <Check /> : <Save />} {saved === row.feature_key ? 'Saved' : 'Save rollout'}</button>
      </article>)}
    </div>
  </div>
}
