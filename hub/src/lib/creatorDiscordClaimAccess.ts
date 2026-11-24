import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { creatorDiscordIdentity, CreatorDiscordError, processCreatorDiscordQueue, verifyCreatorDiscordMembership } from './creatorDiscord'
import { joinCreatorDiscordGuild } from './creatorDiscordAccount'

export async function communityDiscordStatus(admin:SupabaseClient,userId:string,groupId:string){
 const [{data:integrations,error},discordId]=await Promise.all([
  admin.from('creator_discord_integrations').select('id,guild_id,guild_name,role_id,role_name,invite_url').eq('group_id',groupId).eq('enabled',true).order('created_at'),
  creatorDiscordIdentity(admin,userId,false),
 ])
 if(error)throw new CreatorDiscordError('Discord access could not be checked.',503)
 if(!integrations?.length)throw new CreatorDiscordError('This community has not connected Discord.',404)
 const {data:access,error:accessError}=await admin.rpc('creator_discord_access',{p_integration_id:integrations[0].id,p_user_id:userId})
 if(accessError)throw new CreatorDiscordError('Community membership could not be checked.',503)
 if(!access?.allowed)throw new CreatorDiscordError('An active membership in this community is required.',403,'membership_required')
 const {data:jobs,error:jobsError}=await admin.from('creator_discord_jobs').select('integration_id,pending,assigned_discord_id').eq('user_id',userId).in('integration_id',integrations.map(role=>role.id))
 if(jobsError)throw new CreatorDiscordError('Discord role status could not be checked.',503)
 return {integrations,discordId,ready:!!discordId&&integrations.every(role=>jobs?.some(job=>job.integration_id===role.id&&!job.pending&&job.assigned_discord_id===discordId))}
}

export async function claimCommunityDiscord(admin:SupabaseClient,userId:string,groupId:string,client?:SupabaseClient){
 const state=await communityDiscordStatus(admin,userId,groupId)
 if(!state.discordId)throw new CreatorDiscordError('Connect your Discord account first.',409,'discord_reconnect')
 // Check the provider before joining the server, as well as immediately before each role assignment.
 await verifyCreatorDiscordMembership(admin,state.integrations[0].id,userId)
 const {data:access,error}=await admin.rpc('creator_discord_access',{p_integration_id:state.integrations[0].id,p_user_id:userId})
 if(error)throw new CreatorDiscordError('Community membership could not be checked.',503)
 if(!access?.allowed)throw new CreatorDiscordError('An active membership in this community is required.',403,'membership_required')
 if(client)await joinCreatorDiscordGuild(client,state.integrations[0].guild_id,state.discordId)
 const queued=await admin.rpc('queue_creator_discord',{p_group_id:groupId,p_user_id:userId})
 if(queued.error)throw new CreatorDiscordError('Your role request could not be queued.',503)
 for(const role of state.integrations)await processCreatorDiscordQueue(admin,1,userId,role.id)
 const receipt=await communityDiscordStatus(admin,userId,groupId)
 if(!receipt.ready)throw new CreatorDiscordError('Your role delivery is pending. Accept the server rules and ask the creator to check the bot’s role order, then retry.',409,'discord_pending')
 return {guildName:receipt.integrations[0].guild_name,roles:receipt.integrations.map(role=>role.role_name)}
}
