'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowDownToLine, Check, GitBranch, Grid3X3, Plus } from 'lucide-react'
import styles from './MatrixMarketplace.module.css'
import { sportMatrixFactorLabel, type SportMatrixFactor } from '@/lib/sportMatrixPresentation'

type Listing = {
  id: string; title: string; description: string; matrix_type: 'classic' | 'pipeline'; color: string; copy_count: number
  snapshot: { definition?: { factors?: SportMatrixFactor[]; steps?: SportMatrixFactor[] } }
}

export function SportMatrixMarketplace({ sport }: { sport: 'nba' | 'nfl' }) {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [sort, setSort] = useState('newest')
  const [busy, setBusy] = useState<string | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const base = `/api/${sport}-matrix-marketplace`
  const court = sport === 'nba' ? '/the-paint?matrix=1' : '/the-sideline'
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try {
      const response = await fetch(base, { signal, cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(response.status === 403 ? 'Ultimate access required.' : body.error || 'Matrices could not load.')
      if (!signal?.aborted) setListings(body.listings ?? [])
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Matrices could not load.') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [base])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  const visible = useMemo(() => listings.filter(row => (type === 'all' || row.matrix_type === type) && `${row.title} ${row.description}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'popular' ? b.copy_count - a.copy_count : sort === 'name' ? a.title.localeCompare(b.title) : 0), [listings, query, type, sort])
  async function add(id: string) {
    setBusy(id); setError('')
    try {
      const response = await fetch(`${base}/${encodeURIComponent(id)}/import`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Matrix could not be added.')
      setAdded(values => [...values, id])
      window.dispatchEvent(new Event(`${sport}-matrices-changed`))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Matrix could not be added.') }
    finally { setBusy(null) }
  }
  return <div className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroIcon}><Grid3X3 size={24} /></div>
      <div className={styles.heroCopy}><span>{sport.toUpperCase()} MATRICES</span><h1>Matrix Marketplace</h1></div>
      <Link className={styles.publishButton} href={court}><Plus size={17} /> My {sport.toUpperCase()} Matrices</Link>
    </section>
    <section className={styles.sportControls} aria-label={`${sport.toUpperCase()} matrix filters`}>
      <label>Search<input aria-label="Search matrices" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a matrix" /></label>
      <label>Type<select value={type} onChange={e => setType(e.target.value)}><option value="all">All matrices</option><option value="classic">Conditions</option><option value="pipeline">Pipelines</option></select></label>
      <label>Sort<select value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest</option><option value="popular">Most added</option><option value="name">Name A–Z</option></select></label>
    </section>
    {error ? <div role="alert" className={styles.sportStatus}>{error} <button onClick={() => void load()}>Retry</button></div> : null}
    {loading ? <div role="status" className={styles.sportStatus}>Loading matrices…</div> : visible.length ? <div className={styles.sportGrid}>
      {visible.map(row => <article key={row.id} className={styles.sportCard} style={{ '--matrix-color': /^#[0-9a-f]{6}$/i.test(row.color) ? row.color : '#a6ff4b' } as CSSProperties}>
        <header>{row.matrix_type === 'pipeline' ? <GitBranch size={20} /> : <Grid3X3 size={20} />}<div><h2>{row.title}</h2><small>{row.matrix_type === 'pipeline' ? 'Pipeline' : 'Conditions'} · {row.copy_count} adds</small></div></header>
        {row.description ? <p>{row.description}</p> : null}
        <ol>{(row.snapshot.definition?.steps ?? row.snapshot.definition?.factors ?? []).map((factor, index) => <li key={factor.id ?? index}>{sportMatrixFactorLabel(factor)}</li>)}</ol>
        <button disabled={busy === row.id || added.includes(row.id)} onClick={() => void add(row.id)}>{added.includes(row.id) ? <Check size={15} /> : <ArrowDownToLine size={15} />}{added.includes(row.id) ? 'Added' : busy === row.id ? 'Adding…' : 'Add matrix'}</button>
      </article>)}
    </div> : !error ? <div className={styles.sportStatus}>No {sport.toUpperCase()} matrices{query || type !== 'all' ? ' match these filters' : ' published yet'}.</div> : null}
  </div>
}
