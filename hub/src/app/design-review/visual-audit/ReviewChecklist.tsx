'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowUpRight, Check, Circle, Search } from 'lucide-react'
import { releaseStatus, type ReleaseRecord } from './releaseStatus'
import styles from './review.module.css'

export type ReviewItem = { id:string; label:string; route:string|null; group:string; kind:string; status:string; batch:number|string|null; notes:string; checks:Record<string,boolean>; evidence:string[]; release?:ReleaseRecord|null }
const checks: Record<string,string> = { desktopDark:'Desktop · dark',desktopLight:'Desktop · light',phoneDark:'Phone · dark',phoneLight:'Phone · light',keyboard:'Keyboard',motion:'Reduced motion',states:'Loading / empty / error',toolAccess:'Every tool reachable' }

export function ReviewChecklist({ items }: { items:ReviewItem[] }) {
  const [query,setQuery]=useState(''),[group,setGroup]=useState('All areas'),[status,setStatus]=useState('All statuses')
  const groups=[...new Set(items.map(item=>item.group))]
  const visible=items.filter(item=>(group==='All areas'||item.group===group)&&(status==='All statuses'||releaseStatus(item)===status)&&`${item.label} ${item.route??''} ${item.notes}`.toLowerCase().includes(query.toLowerCase()))
  const count=(value:string)=>items.filter(item=>releaseStatus(item)===value).length
  return <div className={styles.page}>
    <header className={styles.header}><div><h1>UI overhaul status</h1><p>Completed changes are live. Queued items still need overhaul work; their existing tools remain available.</p></div><Link href="/design-review">All screens <ArrowUpRight size={15}/></Link></header>
    <div className={styles.progress}><span><strong>{count('Live')}</strong> Live</span><span><strong>{count('In progress')}</strong> In progress</span><span><strong>{count('Queued')}</strong> Queued</span>{count('Ready to deploy')>0&&<span><strong>{count('Ready to deploy')}</strong> Ready to deploy</span>}<span>Production status · previews use illustrative data</span></div>
    <section className={styles.batch} aria-label="Research review batches"><div><h2>Research review</h2><p>The Sideline, NFL tools and player drawers; The Court, Odds Boards and member identity.</p></div><nav><Link href="/the-sideline">The Sideline <ArrowUpRight size={15}/></Link><Link href="/the-paint?view=research">The Court <ArrowUpRight size={15}/></Link><Link href="/the-paint?view=odds-board">NBA Odds Board <ArrowUpRight size={15}/></Link><Link href="/the-sideline?view=odds-board">NFL Odds Board <ArrowUpRight size={15}/></Link><Link href="/design-review/identity">Avatars & badges <ArrowUpRight size={15}/></Link></nav></section>
    <div className={styles.filters}><label><Search size={16}/><input aria-label="Find a review item" placeholder="Find a page, tool or popup" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Review area" value={group} onChange={e=>setGroup(e.target.value)}><option>All areas</option>{groups.map(name=><option key={name}>{name}</option>)}</select><select aria-label="Release status" value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option>{['Live','Ready to deploy','In progress','Queued'].map(name=><option key={name}>{name}</option>)}</select></div>
    <p className={styles.count} role="status">{visible.length} of {items.length} items · expanding an item shows its checks</p>
    <ol className={styles.list}>{visible.map(item=><li key={item.id}><details><summary><span><strong>{item.label}</strong><small>{item.group} · {item.kind}</small></span><span className={styles.status} data-ready={releaseStatus(item)==='Live'}>{releaseStatus(item)}</span></summary><div className={styles.detail}>
      {item.release&&<p>Live on <a href={item.release.url}>SlipSurge</a> · verified {item.release.verifiedAt} · commit {item.release.commit.slice(0,8)}. {item.status==='Approved'?'Owner visual review recorded.':'Owner visual review is optional feedback, not a deployment gate.'}</p>}
      {item.notes&&<p>{item.notes}</p>}
      <div className={styles.checks}>{Object.entries(checks).map(([key,label])=><span key={key} data-passed={item.checks[key]}>{item.checks[key]?<Check size={14}/>:<Circle size={12}/>} {label}</span>)}</div>
      <p>{item.evidence.length?item.evidence.join(' · '):'No verification evidence recorded for this item yet.'}</p>
      {item.route&&!item.route.includes('[')?<Link href={item.route}>Open for review <ArrowUpRight size={14}/></Link>:<small>{item.route??'Shared component'} · representative records are selected when this item is reviewed</small>}
    </div></details></li>)}</ol>
    {!visible.length&&<p className={styles.count}>No matching review items.</p>}
    <footer className={styles.footer}>A shared style change does not mark every page complete. MLB stays in the inventory while it remains off-season. Existing tools, feature flags and access rules remain in place.</footer>
  </div>
}
