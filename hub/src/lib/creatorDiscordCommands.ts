import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CreatorDiscordError, creatorDiscordIdentity, creatorDiscordRequest } from './creatorDiscord'
import { claimCommunityDiscord } from './creatorDiscordClaimAccess'
import { DISCORD_ID } from './creatorDiscordPolicy'
import { PLATFORM_URL } from './platform'

export const CREATOR_DISCORD_COMMANDS=[
 {name:'help',description:'How to connect your SlipSurge community and member roles'},
 {name:'connect',description:'Connect SlipSurge and Discord to unlock your community roles'},
 {name:'access',description:'Check and sync your active SlipSurge community roles'},
 {name:'community',description:'Open the SlipSurge communities connected to this server'},
]
export function discordCommandRateKey(discordId:string){
 const hash=createHash('sha256').update(`slipsurge:discord-command:${discordId}`).digest('hex').slice(0,32)
 return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20)}`
}
/** Upsert only our supported commands. Never bulk-delete unrelated existing commands. */
export async function registerCreatorDiscordCommands(){
 const appId=process.env.DISCORD_APPLICATION_ID
 if(!appId||!DISCORD_ID.test(appId))throw new CreatorDiscordError('Discord application is not configured.',503)
 for(const command of CREATOR_DISCORD_COMMANDS)await creatorDiscordRequest(`/applications/${appId}/commands`,'POST',{...command,type:1,contexts:[0],integration_types:[0]})
 return CREATOR_DISCORD_COMMANDS.length
}

export async function creatorDiscordCommand(admin:SupabaseClient,guildId:string,discordId:string,name:string){
 if(!DISCORD_ID.test(guildId)||!DISCORD_ID.test(discordId))return {content:'Run this command inside your community’s Discord server.'}
 const {data:mappings,error}=await admin.from('creator_discord_integrations').select('group_id').eq('guild_id',guildId).eq('enabled',true).limit(125)
 if(error)throw new CreatorDiscordError('Community connections could not be checked.',503)
 const groupIds=[...new Set((mappings||[]).map(row=>row.group_id).filter(Boolean))].slice(0,25)
 if(!groupIds.length)return {content:`This server has not connected a SlipSurge community yet. Its creator can set it up at ${PLATFORM_URL}/creators/studio?section=communities`}
 const {data:groups,error:groupsError}=await admin.from('groups').select('id,name,slug').in('id',groupIds)
 if(groupsError)throw new CreatorDiscordError('Community connections could not be checked.',503)
 const links=(groups||[]).map(group=>({type:2,style:5,label:String(group.name).slice(0,80),url:`${PLATFORM_URL}/groups/${encodeURIComponent(group.slug)}?discord=connect`}))
 const components=Array.from({length:Math.ceil(links.length/5)},(_,index)=>({type:1,components:links.slice(index*5,index*5+5)}))
 if(name!=='access')return {content:name==='help'?'Use /connect to link your account, /access to sync your member roles, or /community to open your community. Roles require an active membership in that specific community.':'Open your community to connect Discord and claim its member roles.',components}
 const {data:users,error:identityError}=await admin.from('users').select('id').eq('discord_id',discordId).limit(2)
 if(identityError)throw new CreatorDiscordError('Your linked account could not be checked.',503)
 if(users?.length!==1||await creatorDiscordIdentity(admin,users[0].id,false)!==discordId)return {content:'Connect this Discord account to your SlipSurge account first, then use /access again.',components}
 const results:string[]=[]
 // The private reply is bounded; larger communities retain their web claim buttons.
 for(const group of (groups||[]).slice(0,5)){
  try{await claimCommunityDiscord(admin,users[0].id,group.id);results.push(`${group.name}: member roles synced.`)}catch(cause){results.push(`${group.name}: ${cause instanceof CreatorDiscordError?cause.message:'Access could not be checked. Try again.'}`)}
 }
 return {content:results.join('\n').slice(0,1900)||'No community roles are available.',components}
}
