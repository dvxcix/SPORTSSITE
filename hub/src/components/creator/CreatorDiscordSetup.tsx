'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ExternalLink, Hash, RefreshCw, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { connectCommunityDiscord, discordApi, DiscordClientError } from './creatorDiscordClient'
import { MAX_COMMUNITY_DISCORD_ROLES } from '@/lib/creatorDiscordPolicy'
import { DiscordAccessSummary } from './CreatorDiscordClaim'
import { DISCORD_BRAND_STYLE, DiscordLogo } from '@/components/brand/DiscordLogo'
import { DiscordAccountIdentity, DiscordConnectionHeader, DiscordRoleTags, WhopInlineMark } from './CreatorDiscordBrand'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from './creatorDiscord.module.css'

type Role={id:string;name:string}
type Integration={id:string;guild_id:string;guild_name:string;role_id:string;role_name:string;invite_url:string|null}
type Server={id:string;name:string;icon?:string|null}
type Setup={configured:boolean;connected:boolean;accountHandle?:string|null;installUrl:string|null;integrations:Integration[];access?:{name:string;slug:string;type:string;product:{title:string;status:string}|null}}
export function CreatorDiscordSetup({groupId}:{groupId:string}){
 const endpoint=`/api/groups/${groupId}/discord`
 const [setup,setSetup]=useState<Setup|null>(null),[servers,setServers]=useState<Server[]>([]),[guildId,setGuildId]=useState('')
 const [roles,setRoles]=useState<Role[]>([]),[selected,setSelected]=useState<string[]>([]),[invite,setInvite]=useState('')
 const [message,setMessage]=useState(''),[error,setError]=useState(false),[busy,setBusy]=useState('load'),[reconnect,setReconnect]=useState(false)
 const [canCreate,setCanCreate]=useState(false),[roleName,setRoleName]=useState(''),[channels,setChannels]=useState<Role[]>([]),[channelId,setChannelId]=useState(''),[published,setPublished]=useState('')
 const [view,setView]=useState('setup'),[checking,setChecking]=useState(false),[checkedGuild,setCheckedGuild]=useState(''),[checkVersion,setCheckVersion]=useState(0)
 const installationPending=useRef(false)
 const {confirm}=useFeedback()
 const saved=setup?.integrations||[],savedServer=saved[0]
 function selectServer(next:string){setGuildId(next);setRoles([]);setCheckedGuild('');setChecking(false);setMessage('');setError(false);setChannels([]);setChannelId('');setCanCreate(false);setRoleName('');setSelected(saved.filter(role=>role.guild_id===next).map(role=>role.role_id));setInvite(saved.find(role=>role.guild_id===next)?.invite_url||'');setPublished('')}
 const failure=useCallback((cause:unknown)=>{setError(true);setMessage(cause instanceof Error?cause.message:'Try again.');if(cause instanceof DiscordClientError&&cause.code==='discord_reconnect')setReconnect(true)},[])
 const load=useCallback(async(signal?:AbortSignal)=>{
  const state=await discordApi<Setup>(endpoint,{signal})
  setSetup(state);setGuildId(state.integrations[0]?.guild_id||'');setSelected(state.integrations.map(role=>role.role_id));setInvite(state.integrations[0]?.invite_url||'')
  if(state.connected){try{const data=await discordApi<{servers:Server[]}>(endpoint+'?servers=1',{signal});setServers(data.servers);setReconnect(new URL(location.href).searchParams.has('link_error'))}catch(cause){if(cause instanceof DiscordClientError&&cause.code==='discord_reconnect')setReconnect(true);else throw cause}}
 },[endpoint])
 useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>load(controller.signal)).catch(cause=>{if(!controller.signal.aborted){setError(true);setMessage(cause instanceof Error?cause.message:'Discord setup could not be loaded.')}}).finally(()=>{if(!controller.signal.aborted)setBusy('')});return()=>controller.abort()},[load])
 useEffect(()=>{if(new URL(location.href).searchParams.has('link_error'))Promise.resolve().then(()=>{setError(true);setMessage('Discord authorization was not completed. Authorize the Discord account already linked to SlipSurge and try again.')})},[])
 async function connect(){setBusy('connect');setMessage('');try{await connectCommunityDiscord(`/creators/studio?section=communities&discordGroup=${groupId}`,true)}catch(cause){failure(cause);setBusy('')}}
 // Cancel previous server checks so a late response cannot expose the wrong roles.
 useEffect(()=>{
  if(!guildId||!setup?.connected)return
  const controller=new AbortController()
  Promise.resolve().then(async()=>{
   if(controller.signal.aborted)return
   setChecking(true);setCheckedGuild('');setCanCreate(false);setRoles([]);setMessage('');setError(false)
   try{
    const data=await discordApi<{roles:Role[];canCreateRoles:boolean}>(endpoint+'?guildId='+encodeURIComponent(guildId),{signal:controller.signal})
    if(controller.signal.aborted)return
    setRoles(data.roles);setCanCreate(data.canCreateRoles);setCheckedGuild(guildId)
    setSelected(current=>current.filter(id=>data.roles.some(role=>role.id===id)))
    if(!data.roles.length)setMessage('No assignable roles found. Move SlipSurge above your member roles in Discord and refresh, or create a new member role.')
   }catch(cause){if(!controller.signal.aborted)failure(cause)}finally{if(!controller.signal.aborted)setChecking(false)}
  })
  return()=>controller.abort()
 },[endpoint,guildId,setup?.connected,checkVersion,failure])
 useEffect(()=>{
  function returned(){if(installationPending.current&&document.visibilityState==='visible'){installationPending.current=false;setCheckVersion(current=>current+1)}}
  window.addEventListener('focus',returned);document.addEventListener('visibilitychange',returned)
  return()=>{window.removeEventListener('focus',returned);document.removeEventListener('visibilitychange',returned)}
 },[])
 function inspect(){setCheckVersion(current=>current+1)}
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
 const install=setup?.connected&&guildId&&setup.installUrl?new URL(setup.installUrl):null
 if(install&&guildId){install.searchParams.set('guild_id',guildId);install.searchParams.set('disable_guild_select','true')}
 const choices=servers.some(server=>server.id===savedServer?.guild_id)||!savedServer?servers:[{id:savedServer.guild_id,name:savedServer.guild_name},...servers]
 const activeServer=!!guildId&&checkedGuild===guildId,disabled=!!busy||checking
 const dirty=!!savedServer&&(guildId!==savedServer.guild_id||selected.length!==saved.length||selected.some(id=>!saved.some(role=>role.role_id===id))||invite!==(savedServer.invite_url||''))
 const access=setup?.access
 const chosenServer=choices.find(server=>server.id===guildId)
 return <section className={`${styles.panel} ${styles.creatorSetup}`} style={DISCORD_BRAND_STYLE} aria-labelledby={`discord-setup-${groupId}`} aria-busy={!!busy||checking}>
  <DiscordConnectionHeader titleId={`discord-setup-${groupId}`} title="Discord access" description="Connect your server and manage member roles." status={saved.length?'Roles configured':setup?'Set up your server':'Checking connection…'} complete={saved.length>0}/>
  <nav className={styles.views} aria-label="Discord setup views">{[['setup','Set up'],['preview','Member preview'],['access','Access rules']].map(([key,label])=><button key={key} type="button" aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</nav>
  {view==='preview'?<div className={styles.viewContent}><p className={styles.note}>Read-only preview of the member card, using your saved server and roles.</p>{savedServer?<><div className={styles.claim}><DiscordAccessSummary titleId={`discord-preview-${groupId}`} guildName={savedServer.guild_name} roles={saved.map(role=>role.role_name)} ready={false}/><span className={styles.previewAction}><DiscordLogo size={18}/>Connect to Discord</span></div><ol className={styles.journey}><li>Member joins {access?.name||'your community'}{access?.type==='paid'?' with an active membership':''}.</li><li>They connect Discord and approve joining your server.</li><li>SlipSurge verifies access and grants the roles shown above.</li></ol>{access?.slug&&<Link className={styles.linkButton} href={`/groups/${encodeURIComponent(access.slug)}?discord=connect`}>Open community member entry <ExternalLink size={14}/></Link>}</>:<div className={styles.emptyPreview}><DiscordLogo size={38}/><h3>Your member card will appear here</h3><p>Save your server and member roles in Set up to preview what members will receive.</p><Button variant="outline" onClick={()=>setView('setup')}>Set up Discord access</Button></div>}</div>:view==='access'?<div className={styles.viewContent}><h3>Who receives these roles?</h3>{access?<><div className={styles.membershipCard}>{access.type==='paid'?<WhopInlineMark/>:<span className={styles.freeMembership}><Users size={22} aria-hidden/>Community membership</span>}<div><small>{access.type==='paid'?'Connected membership':'Who can claim'}</small><strong>{access.type==='paid'?access.product?.title||'No membership product connected':access.type==='invite_only'?'Invited community members':'Community members'}</strong></div></div><dl className={styles.accessRules}><div><dt>Community</dt><dd>{access.name}</dd></div><div><dt>Discord roles</dt><dd>{saved.length?<DiscordRoleTags roles={saved.map(role=>role.role_name)}/>:<span>Choose and save member roles in Set up</span>}</dd></div></dl>{access.type==='paid'&&!access.product&&<p className={styles.status} data-error>Connect this community to a membership product before inviting paid members.</p>}<p className={styles.note}>{access.type==='paid'?'An active or trialing membership in this community’s connected product is required.':'Members must belong to this community before claiming Discord access.'} Connecting Discord alone does not grant access.</p><p className={styles.note}>When membership access expires, is revoked, or a member leaves, SlipSurge removes the roles managed by this community. Reconnecting a different Discord account also removes access from the previous account.</p><p className={styles.note}>Members stay in your server; other roles are left as they are.</p><Link className={styles.linkButton} href={`/groups/${encodeURIComponent(access.slug)}/settings`}>Manage community membership</Link></>:<p className={styles.status}>Community access details could not be loaded. Return to Set up and retry.</p>}</div>:<>
  <ol className={styles.progress} aria-label="Discord setup progress">{[['Account',!!setup?.connected&&!reconnect],['Server',activeServer],['Roles',!!savedServer&&!dirty]].map(([label,complete],index)=><li key={String(label)} data-complete={complete||undefined}><span>{complete?<Check size={13} aria-hidden/>:index+1}</span>{label}</li>)}</ol>
  {setup?.connected&&!reconnect&&<DiscordAccountIdentity handle={setup.accountHandle}/>}
  {savedServer&&<div className={styles.saved}><div className={styles.serverIdentity}><span className={styles.serverIcon}><SafeImage src={choices.find(server=>server.id===savedServer.guild_id)?.icon} alt="" width={40} height={40} fallback={<Users size={22} aria-hidden/>}/></span><div><small>Connected server</small><strong>{savedServer.guild_name}</strong></div></div><DiscordRoleTags roles={saved.map(role=>role.role_name)}/>{dirty&&<small>Changes are not saved. Members still receive the saved roles above.</small>}</div>}
  {!setup&&busy==='load'?<p role="status" className={styles.note}>Loading Discord setup…</p>:setup?.configured===false?<p className={styles.status}>SlipSurge’s Discord connection is temporarily unavailable. Your saved settings are preserved.</p>:<div className={styles.steps}>
   {(!setup?.connected||reconnect)&&<div className={`${styles.step} ${styles.accountStep}`}><div className={styles.stepTitle}><span className={styles.providerIcon}><DiscordLogo size={22}/></span><div>Your Discord account<small>{setup?.connected?'Reconnect permissions':'Connect your identity'}</small></div></div>{setup?.connected&&<DiscordAccountIdentity handle={setup.accountHandle}/>}<p className={styles.note}>{setup?.connected?'Authorize the Discord account linked to SlipSurge to refresh the list of servers you manage.':'Authorize Discord so we can show the servers you manage.'}</p><div className={styles.actions}><Button disabled={!!busy} onClick={connect} className={styles.discordButton}><DiscordLogo size={18}/>{busy==='connect'?'Opening Discord…':setup?.connected?'Authorize server list':'Connect Discord'}</Button></div></div>}
   {setup?.connected&&<div className={styles.step} data-complete={activeServer||undefined}><div className={styles.stepTitle}><span className={styles.providerIcon}><Users size={21} aria-hidden/></span><div>Your server<small>{activeServer?'Installation verified':'Choose where members join'}</small></div></div>{chosenServer&&guildId!==savedServer?.guild_id&&<div className={styles.serverIdentity}><span className={styles.serverIcon}><SafeImage src={chosenServer.icon} alt="" width={40} height={40} fallback={<Users size={22} aria-hidden/>}/></span><strong>{chosenServer.name}</strong></div>}
    {choices.length>0?<label className={styles.field}>Discord server<select value={guildId} disabled={!!busy} onChange={event=>selectServer(event.target.value)}><option value="">Choose a server you manage</option>{choices.map(server=><option key={server.id} value={server.id}>{server.name}</option>)}</select></label>:<><p className={styles.note}>{reconnect?'Authorize the server list to choose your server.':'No managed servers found. Check that you own the server or have Manage Server permission on this Discord account.'}</p>{!reconnect&&<div className={styles.actions}><Button variant="outline" disabled={disabled} onClick={connect}>Refresh server list</Button></div>}</>}
    {guildId&&<><div className={styles.actions}>{install&&!activeServer&&<a href={install.toString()} onClick={()=>{installationPending.current=true}} target="_blank" rel="noopener noreferrer">Add SlipSurge to this server <ExternalLink size={14}/></a>}<Button variant="outline" disabled={disabled} onClick={inspect} className="min-h-11"><RefreshCw size={14}/>{checking?'Checking server…':activeServer?'Refresh roles':'Check installation'}</Button></div>{activeServer?<p className={styles.success}><Check size={16} aria-hidden/>Server connected · permissions checked</p>:<p className={styles.note}>Add the bot, then move the SlipSurge role above your member roles in Discord → Server Settings → Roles. We’ll check again when you return.</p>}<details><summary>Missing a role or server?</summary><div><p className={styles.note}>You need Manage Server and Manage Roles, or server ownership. Move SlipSurge above the roles you want to offer, save the role order in Discord, then refresh here. Administrative and bot-managed roles cannot be offered to members.</p><div className={styles.actions}><Button variant="outline" disabled={disabled} onClick={connect}>Refresh server list</Button>{install&&activeServer&&<a href={install.toString()} onClick={()=>{installationPending.current=true}} target="_blank" rel="noopener noreferrer">Review bot permissions <ExternalLink size={14}/></a>}</div></div></details></>}
   </div>}
   {activeServer&&(roles.length>0||canCreate)&&<div className={styles.step}><div className={styles.stepTitle}><span className={styles.providerIcon}><Hash size={21} aria-hidden/></span><div>Member roles<small>{selected.length} of {MAX_COMMUNITY_DISCORD_ROLES} selected</small></div></div>
    {roles.length>0&&<fieldset className={styles.roles}><legend>Choose up to {MAX_COMMUNITY_DISCORD_ROLES}. Use separate roles for each SlipSurge community.</legend>{roles.map(role=><label key={role.id} className={styles.role}><input type="checkbox" checked={selected.includes(role.id)} disabled={!!busy||!selected.includes(role.id)&&selected.length>=MAX_COMMUNITY_DISCORD_ROLES} onChange={()=>setSelected(current=>current.includes(role.id)?current.filter(id=>id!==role.id):[...current,role.id])}/><Hash size={14} aria-hidden/>{role.name}</label>)}</fieldset>}
    {canCreate&&<details><summary>Create a member role in Discord</summary><div><label className={styles.field}>New role name<input maxLength={100} value={roleName} onChange={event=>setRoleName(event.target.value)} placeholder="Community member"/></label><p className={styles.note}>Created with no administrative permissions. You can set its channel access in Discord.</p><div className={styles.actions}><Button variant="outline" disabled={!!busy||!roleName.trim()} onClick={()=>action('create_role')} className="min-h-11">Create member role</Button></div></div></details>}
    <label className={styles.field}>Server invite link <span className={styles.note}>Optional fallback for members who prefer to join manually.</span><input type="url" value={invite} onChange={event=>setInvite(event.target.value)} placeholder="https://discord.gg/…"/></label>
    <div className={styles.actions}><Button disabled={disabled||!selected.length||!!savedServer&&!dirty} onClick={save} className="min-h-11">{busy==='save'?'Saving…':savedServer&&!dirty?'Access saved':'Save Discord access'}</Button>{savedServer&&!dirty&&<Button variant="outline" onClick={()=>setView('preview')}>Preview member access</Button>}</div>
   </div>}
  </div>}
  {saved.length>0&&<details><summary>Connect button in your server</summary><div><div className={styles.preview}><strong>Member access on SlipSurge</strong><p>Members open your community, authorize Discord and receive the roles their membership allows.</p><span className={styles.note}>Button: Connect to Discord</span></div><div className={styles.actions}><Button variant="outline" disabled={disabled||guildId!==savedServer?.guild_id||dirty} onClick={()=>action('channels')} className="min-h-11">Choose a channel</Button></div>{channels.length>0&&<><label className={styles.field}>Post connect panel in<select value={channelId} onChange={event=>setChannelId(event.target.value)}><option value="">Choose a text channel</option>{channels.map(channel=><option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label><div className={styles.actions}><Button disabled={disabled||!channelId||dirty||guildId!==savedServer?.guild_id} onClick={()=>action('publish_panel')} className="min-h-11">Publish connect panel</Button></div></>}{published&&<a className={styles.linkButton} href={published} target="_blank" rel="noopener noreferrer">View Discord message <ExternalLink size={14}/></a>}</div></details>}
  {saved.length>0&&<details><summary>Disconnect this community</summary><div><p className={styles.note}>Stops new claims and removes only the member roles managed by this community.</p><div className={styles.actions}><Button variant="outline" disabled={!!busy} onClick={disconnect} className="min-h-11">Disconnect Discord access</Button></div></div></details>}
  {message&&<p role={error?'alert':'status'} className={styles.status} data-error={error||undefined}>{message}</p>}
  {!setup&&!busy&&<div className={styles.actions}><Button variant="outline" className="min-h-11" onClick={()=>{setBusy('load');load().catch(failure).finally(()=>setBusy(''))}}>Retry connection</Button></div>}
  </>}
 </section>
}
