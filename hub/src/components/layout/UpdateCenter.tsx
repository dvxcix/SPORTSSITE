'use client'
import {useEffect,useState} from 'react'
import {ArrowUpRight,ChevronRight,Megaphone,X} from 'lucide-react'
import Link from 'next/link'
import {createClient} from '@/lib/supabase/client'
import {useAuth} from '@/context/AuthContext'
import {ModalSurface} from '@/components/ui/ModalSurface'
import {SafeImage} from '@/components/ui/SafeImage'
import type {ChangelogEntry} from '@/lib/changelog'
import styles from './UpdateCenter.module.css'

export function UpdateCenter({compact=false}:{compact?:boolean}){
 const {profile}=useAuth()
 const [open,setOpen]=useState(false),[entries,setEntries]=useState<ChangelogEntry[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading')
 useEffect(()=>{if(!open)return;let cancelled=false;const client=createClient();void client.from('changelog_entries').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(30).then(({data,error})=>{if(cancelled)return;setStatus(error?'error':'ready');if(!error)setEntries((data??[]) as ChangelogEntry[])});return()=>{cancelled=true}},[open])
 return <><button type="button" className={styles.launcher} onClick={()=>setOpen(true)} aria-label="What's new" title={compact?"What's new":undefined}><Megaphone size={16}/>{!compact&&<><span>What’s new</span><ChevronRight size={14}/></>}</button><ModalSurface open={open} onClose={()=>setOpen(false)} label="What's new in SlipSurge" backdropClassName={styles.backdrop} panelClassName={styles.panel}>
  <header><div><h2>What’s new</h2></div><button type="button" aria-label="Close updates" onClick={()=>setOpen(false)}><X size={19}/></button></header>
  <div className={styles.entries}>{status==='loading'?<p role="status">Loading updates…</p>:status==='error'?<p role="status">Updates couldn’t load. Close and reopen to try again.</p>:!entries.length?<div className={styles.empty}><Megaphone size={30}/><h3>You’re up to date.</h3></div>:entries.map(entry=><article key={entry.id}><div className={styles.date}><span>Product update</span><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}</time></div><h3>{entry.title}</h3><p>{entry.description}</p>{entry.screenshot_urls?.map(url=><SafeImage key={url} src={url} alt="Product update preview" className={styles.image}/>)}{entry.how_to_use&&<div className={styles.tip}><b>Try it out</b><p>{entry.how_to_use}</p></div>}</article>)}</div>
  {profile?.account_type==='admin'&&<footer><Link href="/admin/changelog" onClick={()=>setOpen(false)}>Manage updates <ArrowUpRight size={14}/></Link></footer>}
 </ModalSurface></>
}
