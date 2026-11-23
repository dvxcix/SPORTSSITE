'use client'

import { useId, useState, useEffect, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Switch } from '@/components/ui/Switch'
import styles from './adminWorkspace.module.css'

type SettingValue = string | number | boolean
export type SettingField = { key: string; label: string; type: 'text' | 'email' | 'number' | 'toggle'; default: SettingValue; hint?: string }

export function AdminKeyValueSettings({ fields }: { fields: SettingField[] }) {
  const id = useId()
  const [values, setValues] = useState<Record<string, SettingValue>>(() => Object.fromEntries(fields.map(field => [field.key, field.default])))
  const [loading, setLoading] = useState(true)
  const [loadVersion, setLoadVersion] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    Promise.resolve(supabase.from('site_settings').select('key, value').in('key', fields.map(field => field.key)))
      .then(({ data, error: readError }) => {
        if (cancelled) return
        if (readError) throw new Error('Saved settings could not be loaded.')
        setValues(previous => {
          const next = { ...previous }
          for (const row of data ?? []) {
            const field = fields.find(item => item.key === row.key)
            if (field) next[row.key] = field.type === 'toggle' ? row.value === 'true' : field.type === 'number' ? Number(row.value) : row.value
          }
          return next
        })
        setDirty(false)
      })
      .catch(() => { if (!cancelled) setLoadError('Saved settings could not be loaded. Retry before making changes.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // Each page supplies a fixed settings schema. Retrying must not depend on form edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadVersion])

  function change(key: string, value: SettingValue) {
    setValues(previous => ({ ...previous, [key]: value }))
    setDirty(true)
    setSaved(false)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || loadError || saving || !dirty) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const supabase = createClient()
      const { error: writeError } = await supabase.from('site_settings').upsert(Object.entries(values).map(([key, value]) => ({ key, value: String(value) })), { onConflict: 'key' })
      if (writeError) throw new Error(writeError.message)
      setSaved(true)
      setDirty(false)
    } catch {
      setError('Changes could not be saved. Your edits are still here; try again.')
    } finally { setSaving(false) }
  }

  if (loading) return <p role="status" className={styles.notice}>Loading saved settings…</p>
  if (loadError) return <div className={styles.settingsForm}><p role="alert" className={styles.settingsError}>{loadError}</p><button type="button" className={styles.toolButton} onClick={() => { setLoading(true); setLoadError(''); setLoadVersion(value => value + 1) }}>Retry settings</button></div>

  return <form onSubmit={save} className={styles.settingsForm} aria-label="Platform settings" aria-busy={saving}>
    <div className={styles.settingsFields}>{fields.map(field => <div key={field.key} className={styles.settingsRow}>
      <div><label htmlFor={field.type === 'toggle' ? undefined : `${id}-${field.key}`}>{field.label}</label>{field.hint && <p id={`${id}-${field.key}-hint`}>{field.hint}</p>}</div>
      {field.type === 'toggle' ? <Switch checked={!!values[field.key]} disabled={saving} onChange={value => change(field.key, value)} ariaLabel={field.label} /> : <input id={`${id}-${field.key}`} type={field.type} aria-describedby={field.hint ? `${id}-${field.key}-hint` : undefined} value={String(values[field.key] ?? '')} disabled={saving} onChange={event => change(field.key, event.target.value)} />}
    </div>)}</div>
    {error && <p role="alert" className={styles.settingsError}>{error}</p>}
    <div className={styles.settingsFooter}><span role="status">{saved ? 'Changes saved.' : dirty ? 'Unsaved changes' : 'Saved settings loaded'}</span><button type="submit" disabled={saving || !dirty} className={styles.toolButton}>{saving ? 'Saving…' : 'Save changes'}</button></div>
  </form>
}
