'use client'
import {useState} from 'react'
import inventory from '../../../review/catalog.json'
import {ThemeToggle} from '@/components/theme/ThemeToggle'
export function DesignReviewCatalog(){
 const [query,setQuery]=useState('')
 const groups=[...new Set(inventory.map(entry=>entry.group))]
 return <div className="ss-review-catalog"><div className="flex flex-wrap items-center justify-between gap-4"><div><p>SLIPSURGE / ENTIRE APP</p><h1>Every screen, one framework.</h1></div><ThemeToggle full/></div><p className="mt-3">The actual application with isolated illustrative data. Review each page and tool in either theme. Operational actions, payments and external services are blocked.</p><input aria-label="Find a review screen" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a page or tool…"/>{groups.map(group=>{const entries=inventory.filter(entry=>entry.group===group&&(entry.name+' '+entry.href).toLowerCase().includes(query.toLowerCase()));return entries.length?<section className="ss-review-group" key={group}><h2>{group} <span className="text-[var(--text-3)] text-sm">{entries.length}</span></h2><div>{entries.map(entry=><a key={entry.href} href={entry.href+(entry.href.includes('?')?'&':'?')+'reviewRole='+(entry.href==='/onboarding'?'onboarding':entry.group==='Administration'?'admin':entry.group==='Account entry'?'guest':'member')}><span>{entry.name}</span><small>{entry.href}</small></a>)}</div></section>:null})}</div>
}
