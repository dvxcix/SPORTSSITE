'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowUpRight, Check, Circle, Search } from 'lucide-react'
import styles from './review.module.css'

export type ReviewItem = { id:string; label:string; route:string|null; group:string; kind:string; status:string; batch:number|null; notes:string; checks:Record<string,boolean>; evidence:string[] }
const checks: Record<string,string> = { desktopDark:'Desktop · dark',desktopLight:'Desktop · light',phoneDark:'Phone · dark',phoneLight:'Phone · light',keyboard:'Keyboard',motion:'Reduced motion',states:'Loading / empty / error',toolAccess:'Every tool reachable' }

export function ReviewChecklist({ items }: { items:ReviewItem[] }) {
  const [query,setQuery]=useState(''),[group,setGroup]=useState('All areas'),[status,setStatus]=useState('All statuses')
  const groups=[...new Set(items.map(item=>item.group))]
  const visible=items.filter(item=>(group==='All areas'||item.group===group)&&(status==='All statuses'||item.status===status)&&`${item.label} ${item.route??''} ${item.notes}`.toLowerCase().includes(query.toLowerCase()))
  const ready=items.filter(item=>item.status==='Review ready').length
  return <div className={styles.page}>
    <header className={styles.header}><div><h1>Page-by-page review</h1><p>Implementation, verification and your approval are tracked separately.</p></div><Link href="/design-review">All screens <ArrowUpRight size={15}/></Link></header>
    <div className={styles.progress}><span><strong>{items.length}</strong> items</span><span><strong>{ready}</strong> ready to review</span><span><strong>{items.filter(item=>item.status==='Approved').length}</strong> approved</span><span>Private review · illustrative data</span></div>
    <section className={styles.batch} aria-label="Research review batches"><div><h2>Research review</h2><p>The Sideline, NFL tools and player drawers; The Court, Odds Boards and member identity.</p></div><nav><Link href="/the-sideline">The Sideline <ArrowUpRight size={15}/></Link><Link href="/the-paint?view=research">The Court <ArrowUpRight size={15}/></Link><Link href="/the-paint?view=odds-board">NBA Odds Board <ArrowUpRight size={15}/></Link><Link href="/the-sideline?view=odds-board">NFL Odds Board <ArrowUpRight size={15}/></Link><Link href="/design-review/identity">Avatars & badges <ArrowUpRight size={15}/></Link></nav></section>
    <div className={styles.filters}><label><Search size={16}/><input aria-label="Find a review item" placeholder="Find a page, tool or popup" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Review area" value={group} onChange={e=>setGroup(e.target.value)}><option>All areas</option>{groups.map(name=><option key={name}>{name}</option>)}</select><select aria-label="Review status" value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option>{['Queued','In progress','Review ready','Approved'].map(name=><option key={name}>{name}</option>)}</select></div>
    <p className={styles.count} role="status">{visible.length} of {items.length} items · expanding an item shows its checks</p>
    <ol className={styles.list}>{visible.map(item=><li key={item.id}><details><summary><span><strong>{item.label}</strong><small>{item.group} · {item.kind}</small></span><span className={styles.status} data-ready={item.status==='Review ready'}>{item.status}</span></summary><div className={styles.detail}>
      {item.notes&&<p>{item.notes}</p>}
      <div className={styles.checks}>{Object.entries(checks).map(([key,label])=><span key={key} data-passed={item.checks[key]}>{item.checks[key]?<Check size={14}/>:<Circle size={12}/>} {label}</span>)}</div>
      <p>{item.evidence.length?item.evidence.join(' · '):'No verification evidence recorded for this item yet.'}</p>
      {item.route&&!item.route.includes('[')?<Link href={item.route}>Open for review <ArrowUpRight size={14}/></Link>:<small>{item.route??'Shared component'} · representative records are selected when this item is reviewed</small>}
    </div></details></li>)}</ol>
    {!visible.length&&<p className={styles.count}>No matching review items.</p>}
    <footer className={styles.footer}>A shared style change does not mark every page complete. MLB stays in the inventory while it remains off-season. Existing tools, feature flags and access rules remain in place.</footer>
  </div>
}
