'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { discordApi } from './creatorDiscordClient'
import styles from './creatorDiscord.module.css'
type Health={configured:boolean;connected:boolean;name?:string;publicBot?:boolean;requiresCodeGrant?:boolean;interactionsReady?:boolean;activeRoleMappings?:number;pendingDeliveries?:number;missingCommands?:string[]}
export function CreatorDiscordHealth(){
 const [health,setHealth]=useState<Health|null>(null),[busy,setBusy]=useState(true),[message,setMessage]=useState('')
 async function load(){setBusy(true);setMessage('');try{setHealth(await discordApi<Health>('/api/admin/discord/creator-health'))}catch(cause){setMessage(cause instanceof Error?cause.message:'Status unavailable.')}finally{setBusy(false)}}
 useEffect(()=>{const controller=new AbortController();discordApi<Health>('/api/admin/discord/creator-health',{signal:controller.signal}).then(setHealth).catch(cause=>{if(!controller.signal.aborted)setMessage(cause instanceof Error?cause.message:'Status unavailable.')}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});return()=>controller.abort()},[])
 return <section className={`${styles.panel} ss-flow-card`} aria-labelledby="creator-discord-health"><div className={styles.heading}><div><h2 id="creator-discord-health">Creator server connections</h2><p className={styles.description}>The shared SlipSurge bot serves each creator’s server. These connections use community memberships, independently of the SlipSurge server’s tier roles below.</p></div><Button variant="outline" className="min-h-11" disabled={busy} onClick={load}>{busy?'Checking…':'Refresh status'}</Button></div>
  {health&&<><p className={styles.status}>{health.connected?`${health.name}: connected`:'Discord connection needs attention.'}</p>{health.connected&&<><p className={styles.note}>{health.activeRoleMappings} active role mappings · {health.pendingDeliveries} pending deliveries</p><ul className="mt-3 space-y-2 text-sm"><li>{health.publicBot&&!health.requiresCodeGrant?'Creator server installation is available.':'Enable Public Bot and disable Requires OAuth2 Code Grant in the Discord developer portal for creator installations.'}</li><li>{health.interactionsReady?'Server commands point to the production interaction handler.':'Set the Discord Interactions Endpoint URL to https://www.slipsurge.com/api/discord/interactions.'}</li><li>{health.missingCommands?.length?`Register commands below to add: ${health.missingCommands.map(name=>'/'+name).join(', ')}.`:'Creator commands registered: /connect, /access, /community and /help.'}</li></ul></>}</>}{message&&<p role="alert" className={styles.status} data-error>{message}</p>}
 </section>
}
