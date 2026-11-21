'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Home, Loader2, RotateCcw } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { DEFAULT_RESEARCH_PREFERENCES, LAUNCH_PAGES, RESEARCH_BOOKS, type ResearchPreferences } from '@/lib/researchPreferences'
import styles from './ResearchPreferencesForm.module.css'

export function ResearchPreferencesForm({ initial, available, access }: { initial: ResearchPreferences; available: boolean; access: { nba: boolean; nfl: boolean } }) {
  const [value, setValue] = useState(initial), [baseline, setBaseline] = useState(initial)
  const [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false), [uncertain, setUncertain] = useState(false)
  const lock = useRef(false)
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline)
  const update = (next: ResearchPreferences) => { setValue(next); setMessage(''); setFailed(false) }
  const toggle = (id: string) => {
    const books = value.books.includes(id) ? value.books.filter(book => book !== id) : [...value.books, id]
    update({ ...value, books, primaryBook: books.includes(value.primaryBook ?? '') ? value.primaryBook : books[0] ?? null })
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (lock.current || !dirty || !available || uncertain) return
    lock.current = true; setSaving(true); setMessage(''); setFailed(false)
    try {
      const response = await fetch('/api/account/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'research', value, expected: baseline }) })
      if (!response.ok) {
        // A lost response may follow a committed write. Reload before retrying.
        setUncertain(response.status >= 500 || response.status === 409)
        throw new Error(response.status === 409 ? 'These settings changed in another tab. Reload to see the saved version.' : response.status === 401 ? 'Sign in again to save your settings.' : 'Could not confirm the save. Reload to check your settings.')
      }
      setBaseline(value); setMessage('Saved across your devices. New visits use these defaults.')
    } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : 'Could not confirm the save. Reload to check your settings.'); setUncertain(true)
    } finally { lock.current = false; setSaving(false) }
  }
  return <form className={styles.form} onSubmit={save}>
    {!available && <p role="alert" className={styles.notice}>Your saved settings are unavailable. <button type="button" onClick={() => location.reload()}>Reload</button> before making changes.</p>}
    <fieldset className={styles.section} disabled={!available || saving || uncertain}>
      <legend><Home size={19} aria-hidden="true"/> Launch page</legend>
      <label className={styles.field} htmlFor="research-launch">Open SlipSurge to</label>
      <select id="research-launch" value={value.launchPage} onChange={event => update({ ...value, launchPage: event.target.value })}>
        {['Workspace', 'Community', 'NBA', 'NFL'].map(group => <optgroup key={group} label={group}>{LAUNCH_PAGES.filter(page => page.group === group).map(page => {
          const locked = (group === 'NBA' && !access.nba) || (group === 'NFL' && !access.nfl)
          return <option key={page.id} value={page.id} disabled={locked}>{page.label}{locked ? ' · access required' : ''}</option>
        })}</optgroup>)}
      </select>
      <p>Used when you open the app, visit Home or sign in. Direct links still open the page you chose.</p>
    </fieldset>
    <fieldset className={styles.section} disabled={!available || saving || uncertain}>
      <legend>Sportsbooks</legend>
      <p>Choose the books you use. You can switch to any available book in a tool.</p>
      <div className={styles.books}>{RESEARCH_BOOKS.map(([id, label]) => <label key={id} className={styles.book} data-selected={value.books.includes(id)}>
        <input type="checkbox" aria-label={label} checked={value.books.includes(id)} onChange={() => toggle(id)}/><span aria-hidden="true"><BookLogo vendor={id} size={27}/></span><span>{label}</span><Check size={16} className={styles.check} aria-hidden="true"/>
      </label>)}</div>
      <div className={styles.primary}><label htmlFor="research-primary">Primary book</label><select id="research-primary" disabled={!value.books.length} value={value.primaryBook ?? ''} onChange={event => update({ ...value, primaryBook: event.target.value })}>
        {!value.books.length && <option value="">Tool defaults</option>}{RESEARCH_BOOKS.filter(([id]) => value.books.includes(id)).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></div>
      <p>{value.books.length ? 'Your primary book opens single-book views. Comparisons start with your selected books; if none are available, all captured books are shown.' : 'No preferred books selected. Each tool keeps its usual default and comparisons show all captured books.'}</p>
    </fieldset>
    <div className={styles.actions}>
      <button className={styles.save} type="submit" disabled={!dirty || saving || !available || uncertain}>{saving ? <Loader2 size={17} className={styles.spinner}/> : <Check size={17}/>} {saving ? 'Saving…' : 'Save preferences'}</button>
      <button type="button" disabled={saving || !available || uncertain} onClick={() => update(structuredClone(DEFAULT_RESEARCH_PREFERENCES))}><RotateCcw size={16}/> Reset defaults</button>
      <Link href="/launch" prefetch={false}>Open my launch page ↗</Link>
    </div>
    {message && <p role={failed ? 'alert' : 'status'} className={styles.notice}>{message}{uncertain && <> <button type="button" onClick={() => location.reload()}>Reload settings</button></>}</p>}
  </form>
}
