import 'server-only'
import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import { CreatorDiscordError } from './creatorDiscord'

export async function creatorDiscordOwner(groupId:string){
 if(!/^[0-9a-f-]{36}$/i.test(groupId))throw new CreatorDiscordError('Community not found.',404)
 const client=await createClient(),{data:{user}}=await client.auth.getUser()
 if(!user)throw new CreatorDiscordError('Sign in first.',401)
 const admin=createAdminClient()
 const {data:group,error}=await admin.from('groups').select('id,owner_id,name,slug,access_type,creator_product_id').eq('id',groupId).maybeSingle()
 if(error)throw new CreatorDiscordError('Community access could not be checked.',503)
 if(!group||group.owner_id!==user.id)throw new CreatorDiscordError('Community owner access required.',403)
 return {client,admin,user,group}
}
export function requireDiscordSameOrigin(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new CreatorDiscordError('Open Discord setup from SlipSurge.',403)
}
