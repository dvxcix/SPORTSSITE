'use client'
import { useCallback, useEffect, useState } from 'react'
import { Check, ExternalLink, Link2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { connectCommunityDiscord, discordApi, DiscordClientError } from './creatorDiscordClient'
import styles from './creatorDiscord.module.css'

type Status={connected:boolean;ready:boolean;guildName:string;roles:string[];inviteUrl:string|null}
export function CreatorDiscordClaim({groupId,slug,guildName,roleName,inviteUrl}:{groupId:string;slug:string;guildName:string;roleName:string;inviteUrl:string|null}){
 const endpoint=`/api/groups/${groupId}/discord/claim`
 const [state,setState]=useState<Status|null>(null),[busy,setBusy]=useState('load'),[message,setMessage]=useState(''),[error,setError]=useState(false),[reconnect,setReconnect]=useState(false)
 const claim=useCallback(async()=>{
  setBusy('claim');setMessage('');setError(false)
  try{const result=await discordApi<{guildName:string;roles:string[]}>(endpoint,{method:'POST'});setState({connected:true,ready:true,guildName:result.guildName,roles:result.roles,inviteUrl});setMessage(`Your member roles are ready in ${result.guildName}.`);setReconnect(false)}catch(cause){setError(true);setMessage(cause instanceof Error?cause.message:'Try again.');if(cause instanceof DiscordClientError&&cause.code==='discord_reconnect')setReconnect(true)}finally{setBusy('')}
 },[endpoint,inviteUrl])
 useEffect(()=>{
  const controller=new AbortController()
  discordApi<Status>(endpoint,{signal:controller.signal}).then(async data=>{
   if(controller.signal.aborted)return
   setState(data)
   const url=new URL(location.href)
   if(url.searchParams.get('discord')==='claim'){
    url.searchParams.delete('discord');history.replaceState(history.state,'',url.pathname+url.search+url.hash)
    await claim()
   }
  }).catch(cause=>{if(!controller.signal.aborted){setError(true);setMessage(cause instanceof Error?cause.message:'Access could not be checked.')}}).finally(()=>{if(!controller.signal.aborted)setBusy('')})
  return()=>controller.abort()
 },[endpoint,claim])
 async function connect(){setBusy('connect');setMessage('');try{await connectCommunityDiscord(`/groups/${encodeURIComponent(slug)}?discord=claim`)}catch(cause){setError(true);setMessage(cause instanceof Error?cause.message:'Discord could not be connected.');setBusy('')}}
 const connected=state?.connected&&!reconnect
 return <section className={`${styles.panel} ${styles.claim}`} aria-busy={!!busy} aria-labelledby={`discord-claim-${groupId}`}>
  <div className={styles.heading}><div><h2 id={`discord-claim-${groupId}`}>Your Discord access</h2><p className={styles.description}>{state?.guildName||guildName}</p></div>{state?.ready&&<span className={styles.success}><Check size={16}/>Roles synced</span>}</div>
  <p className={styles.note}>{state?.roles.join(' · ')||roleName}</p>
  <p className={styles.note}>Connect your account to join this server and unlock your member roles. Access follows your community membership.</p>
  <div className={styles.actions}>{!connected?<Button disabled={!!busy} onClick={connect} className="min-h-11"><Link2 size={15}/>{busy==='load'?'Checking access…':reconnect?'Reconnect Discord':'Connect to Discord'}</Button>:<Button disabled={!!busy} onClick={claim} className="min-h-11"><RefreshCw size={15}/>{busy==='claim'?'Verifying membership…':state?.ready?'Check access':'Join & claim member roles'}</Button>}{(state?.inviteUrl||inviteUrl)&&<a href={state?.inviteUrl||inviteUrl!} target="_blank" rel="noopener noreferrer">Open server <ExternalLink size={14}/></a>}</div>
  {message&&<p role={error?'alert':'status'} className={styles.status} data-error={error||undefined}>{message}</p>}
 </section>
}
