'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, ExternalLink, Link2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { connectCommunityDiscord, discordApi, DiscordClientError } from './creatorDiscordClient'
import { MAX_COMMUNITY_DISCORD_ROLES } from '@/lib/creatorDiscordPolicy'
import styles from './creatorDiscord.module.css'

type Role={id:string;name:string}
type Integration={id:string;guild_id:string;guild_name:string;role_id:string;role_name:string;invite_url:string|null}
type Server={id:string;name:string}
type Setup={configured:boolean;connected:boolean;installUrl:string|null;integrations:Integration[]}
export function CreatorDiscordSetup({groupId}:{groupId:string}){
 const endpoint=`/api/groups/${groupId}/discord`
 const [setup,setSetup]=useState<Setup|null>(null),[servers,setServers]=useState<Server[]>([]),[guildId,setGuildId]=useState('')
 const [roles,setRoles]=useState<Role[]>([]),[selected,setSelected]=useState<string[]>([]),[invite,setInvite]=useState('')
 const [message,setMessage]=useState(''),[error,setError]=useState(false),[busy,setBusy]=useState('load'),[reconnect,setReconnect]=useState(false)
 const [canCreate,setCanCreate]=useState(false),[roleName,setRoleName]=useState(''),[channels,setChannels]=useState<Role[]>([]),[channelId,setChannelId]=useState(''),[published,setPublished]=useState('')
 const {confirm}=useFeedback()
 const saved=setup?.integrations||[],savedServer=saved[0]
 function failure(cause:unknown){setError(true);setMessage(cause instanceof Error?cause.message:'Try again.');if(cause instanceof DiscordClientError&&cause.code==='discord_reconnect')setReconnect(true)}
 const load=useCallback(async(signal?:AbortSignal)=>{
  const state=await discordApi<Setup>(endpoint,{signal})
  setSetup(state);setGuildId(state.integrations[0]?.guild_id||'');setSelected(state.integrations.map(role=>role.role_id));setInvite(state.integrations[0]?.invite_url||'')
  if(state.connected){try{const data=await discordApi<{servers:Server[]}>(endpoint+'?servers=1',{signal});setServers(data.servers);setReconnect(false)}catch(cause){if(cause instanceof DiscordClientError&&cause.code==='discord_reconnect')setReconnect(true);else throw cause}}
 },[endpoint])
 useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>load(controller.signal)).catch(cause=>{if(!controller.signal.aborted){setError(true);setMessage(cause instanceof Error?cause.message:'Discord setup could not be loaded.')}}).finally(()=>{if(!controller.signal.aborted)setBusy('')});return()=>controller.abort()},[load])
 async function connect(){setBusy('connect');setMessage('');try{await connectCommunityDiscord(`/creators/studio?section=communities&discordGroup=${groupId}`,true)}catch(cause){failure(cause);setBusy('')}}
 async function inspect(){setBusy('inspect');setMessage('');setError(false);setRoles([]);try{
  const data=await discordApi<{guildName:string;roles:Role[];canCreateRoles:boolean}>(endpoint+'?guildId='+encodeURIComponent(guildId))
  setRoles(data.roles);setCanCreate(data.canCreateRoles)
  setSelected(current=>current.filter(id=>data.roles.some(role=>role.id===id)))
  if(!data.roles.length)setMessage('No member roles are available yet. Create one below, or move SlipSurge above your member roles in Discord.')
 }catch(cause){failure(cause)}finally{setBusy('')}}
 async function save(){setBusy('save');setMessage('');setError(false);try{
  await discordApi(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guildId,roleIds:selected,inviteUrl:invite})})
  await load();setMessage('Discord access saved. Membership changes will update these roles automatically.')
 }catch(cause){failure(cause)}finally{setBusy('')}}
 async function disconnect(){
  if(!await confirm({title:'Disconnect Discord access?',message:'This stops new claims and queues the community’s previously assigned roles for removal.',confirmLabel:'Disconnect',tone:'warning'}))return
  setBusy('disconnect');setMessage('');setError(false);try{await discordApi(endpoint,{method:'DELETE'});setRoles([]);await load();setMessage('Disconnected. Previously assigned member roles are queued for removal.')}catch(cause){failure(cause)}finally{setBusy('')}
 }
 async function action(kind:'create_role'|'channels'|'publish_panel'){
  setBusy(kind);setMessage('');setError(false)
  try{
   const data=await discordApi<{role?:Role;channels?:Role[];url?:string}>(endpoint+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:kind,guildId,name:roleName,channelId})})
   if(data.role){setRoles(current=>[...current,data.role!]);setSelected(current=>current.length<MAX_COMMUNITY_DISCORD_ROLES?[...current,data.role!.id]:current);setRoleName('');setMessage('Role created in Discord. Save Discord access to use it for this community.')}
   if(data.channels)setChannels(data.channels)
   if(data.url){setPublished(data.url);setMessage('Connect panel published in your Discord channel.')}
  }catch(cause){failure(cause)}finally{setBusy('')}
 }
 const install=setup?.installUrl?new URL(setup.installUrl):null
 if(install&&guildId){install.searchParams.set('guild_id',guildId);install.searchParams.set('disable_guild_select','true')}
 const choices=servers.some(server=>server.id===savedServer?.guild_id)||!savedServer?servers:[{id:savedServer.guild_id,name:savedServer.guild_name},...servers]
 return <section className={styles.panel} aria-labelledby={`discord-setup-${groupId}`} aria-busy={!!busy}>
  <div className={styles.heading}><div><h2 id={`discord-setup-${groupId}`}>Discord access</h2><p className={styles.description}>Your community, in your own server. Unlock member roles while access is active.</p></div>{saved.length>0&&<span className={styles.success}><Check size={16} aria-hidden/>Connected</span>}</div>
  {savedServer&&<div className={styles.saved}><strong>{savedServer.guild_name}</strong><p>{saved.map(role=>role.role_name).join(' · ')}</p></div>}
  {!setup&&busy==='load'?<p role="status" className={styles.note}>Loading Discord setup…</p>:setup?.configured===false?<p className={styles.status}>SlipSurge’s Discord connection is temporarily unavailable. Your saved settings are preserved.</p>:<div className={styles.steps}>
   <div className={styles.step} data-complete={setup?.connected||undefined}><div className={styles.stepTitle}><span className={styles.number}>{setup?.connected?<Check size={13}/>:1}</span>Your Discord account</div><p className={styles.note}>{setup?.connected?'Your linked account verifies which servers you manage.':'Authorize Discord so we can show the servers you manage.'}</p>{(!setup?.connected||reconnect)&&<div className={styles.actions}><Button variant="outline" disabled={!!busy} onClick={connect} className="min-h-11"><Link2 size={15}/>{setup?.connected?'Authorize server list':'Connect Discord'}</Button></div>}</div>
   <div className={styles.step} data-complete={saved.length>0||undefined}><div className={styles.stepTitle}><span className={styles.number}>2</span>Your server</div>
    {choices.length>0?<label className={styles.field}>Discord server<select value={guildId} disabled={!!busy} onChange={event=>{setGuildId(event.target.value);setRoles([]);setChannels([]);setSelected(saved.filter(role=>role.guild_id===event.target.value).map(role=>role.role_id));setPublished('')}}><option value="">Choose a server you manage</option>{choices.map(server=><option key={server.id} value={server.id}>{server.name}</option>)}</select></label>:<p className={styles.note}>{reconnect?'Authorize the server list to choose your server.':'Your managed servers will appear after connecting Discord.'}</p>}
    <div className={styles.actions}>{install&&<a href={install.toString()} target="_blank" rel="noopener noreferrer">Add SlipSurge to server <ExternalLink size={14}/></a>}<Button variant="outline" disabled={!!busy||!guildId} onClick={inspect} className="min-h-11"><RefreshCw size={14}/>{busy==='inspect'?'Checking…':'Check server & roles'}</Button></div>
    <p className={styles.note}>Discord opens its own permission screen. After adding SlipSurge, return here and check the server. Move the SlipSurge role above the roles you want it to manage.</p>
   </div>
   {(roles.length>0||canCreate)&&<div className={styles.step}><div className={styles.stepTitle}><span className={styles.number}>3</span>Member roles</div>
    {roles.length>0&&<fieldset className={styles.roles}><legend>Choose up to {MAX_COMMUNITY_DISCORD_ROLES}. Use separate roles for each SlipSurge community.</legend>{roles.map(role=><label key={role.id} className={styles.role}><input type="checkbox" checked={selected.includes(role.id)} disabled={!!busy||!selected.includes(role.id)&&selected.length>=MAX_COMMUNITY_DISCORD_ROLES} onChange={()=>setSelected(current=>current.includes(role.id)?current.filter(id=>id!==role.id):[...current,role.id])}/>{role.name}</label>)}</fieldset>}
    {canCreate&&<details><summary>Create a member role in Discord</summary><div><label className={styles.field}>New role name<input maxLength={100} value={roleName} onChange={event=>setRoleName(event.target.value)} placeholder="Community member"/></label><p className={styles.note}>Created with no administrative permissions. You can set its channel access in Discord.</p><div className={styles.actions}><Button variant="outline" disabled={!!busy||!roleName.trim()} onClick={()=>action('create_role')} className="min-h-11">Create member role</Button></div></div></details>}
    <label className={styles.field}>Server invite link <span className={styles.note}>Optional fallback for members who prefer to join manually.</span><input type="url" value={invite} onChange={event=>setInvite(event.target.value)} placeholder="https://discord.gg/…"/></label>
    <div className={styles.actions}><Button disabled={!!busy||!selected.length} onClick={save} className="min-h-11">{busy==='save'?'Saving…':'Save Discord access'}</Button></div>
   </div>}
  </div>}
  {saved.length>0&&<details><summary>Connect button in your server</summary><div><div className={styles.preview}><strong>Member access on SlipSurge</strong><p>Members open your community, authorize Discord and receive the roles their membership allows.</p><span className={styles.note}>Button: Connect to Discord</span></div><div className={styles.actions}><Button variant="outline" disabled={!!busy||guildId!==savedServer?.guild_id} onClick={()=>action('channels')} className="min-h-11">Choose a channel</Button></div>{channels.length>0&&<><label className={styles.field}>Post connect panel in<select value={channelId} onChange={event=>setChannelId(event.target.value)}><option value="">Choose a text channel</option>{channels.map(channel=><option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label><div className={styles.actions}><Button disabled={!!busy||!channelId} onClick={()=>action('publish_panel')} className="min-h-11">Publish connect panel</Button></div></>}{published&&<a className={styles.linkButton} href={published} target="_blank" rel="noopener noreferrer">View Discord message <ExternalLink size={14}/></a>}</div></details>}
  {saved.length>0&&<details><summary>Disconnect this community</summary><div><p className={styles.note}>Stops new claims and removes only the member roles managed by this community.</p><div className={styles.actions}><Button variant="outline" disabled={!!busy} onClick={disconnect} className="min-h-11">Disconnect Discord access</Button></div></div></details>}
  {message&&<p role={error?'alert':'status'} className={styles.status} data-error={error||undefined}>{message}</p>}
  {!setup&&!busy&&<div className={styles.actions}><Button variant="outline" className="min-h-11" onClick={()=>{setBusy('load');load().catch(failure).finally(()=>setBusy(''))}}>Retry connection</Button></div>}
 </section>
}
