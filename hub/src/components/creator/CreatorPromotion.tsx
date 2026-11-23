'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Copy, Megaphone, Check } from 'lucide-react'
import type { CreatorStore } from '@/lib/creatorStorefront'
import styles from '@/app/creators/studio/CreatorStudio.module.css'
export function CreatorPromotion({store,username,onSetup}:{store:CreatorStore|null;username:string;onSetup:()=>void}){
 const [copied,setCopied]=useState(false),[error,setError]=useState('')
 return <section className={styles.panel}><header><h2>Grow your community</h2><Megaphone size={19}/></header><p className={styles.setupNote}>{store?.status==='published'?'Your store is available in creator discovery. Sports and tags help members find your work.':'Publish your store to appear in creator discovery, including free communities.'}</p><div className={styles.reviewDetails}><dl><div><dt>Marketplace</dt><dd>{store?.status==='published'?'Published':'Finish store setup'}</dd></div><div><dt>SlipSurge feature</dt><dd>{store?.featured?'Featured in discovery':'Selected by SlipSurge'}</dd></div><div><dt>Sports & specialties</dt><dd>{[...(store?.sports||[]),...(store?.tags||[])].join(' · ')||'Add your coverage'}</dd></div></dl></div><div className={styles.heroActions}><button onClick={onSetup}>Edit store & tags</button><button disabled={store?.status!=='published'} onClick={()=>void navigator.clipboard.writeText(window.location.origin+'/creators/'+username).then(()=>{setCopied(true);setError('')}).catch(()=>setError('Copy the address from your storefront.'))}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Copied':'Copy store link'}</button><Link href="/creators">Explore discovery <ArrowUpRight size={14}/></Link></div>{error&&<p role="alert" className={styles.setupError}>{error}</p>}</section>
}
