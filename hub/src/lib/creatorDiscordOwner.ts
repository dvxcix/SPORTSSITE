import 'server-only'
import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import { CreatorDiscordError } from './creatorDiscord'
import { accountSettingsActor } from './supabase/accountSettingsActor'
import { canViewMlb } from './mlbViewerAccess'

export async function creatorDiscordOwner(groupId:string,request?:Request){
 if(!/^[0-9a-f-]{36}$/i.test(groupId))throw new CreatorDiscordError('Community not found.',404)
 const native=request?.headers.has('authorization') ? await accountSettingsActor(request) : null
 if(native?.error)throw new CreatorDiscordError('Sign in to continue.',native.error.status)
 const client=native?.supabase??await createClient()
 const user=native?.user??(await client.auth.getUser()).data.user
 if(!user)throw new CreatorDiscordError('Sign in first.',401)
 const admin=createAdminClient()
 const {data:group,error}=await admin.from('groups').select('id,owner_id,name,slug,access_type,creator_product_id,sport').eq('id',groupId).maybeSingle()
 if(error)throw new CreatorDiscordError('Community access could not be checked.',503)
 if(!group||group.owner_id!==user.id)throw new CreatorDiscordError('Community owner access required.',403)
 if(native&&group.sport?.toUpperCase()==='MLB'&&!await canViewMlb(client,user.id))throw new CreatorDiscordError('Community not found.',404)
 return {client,admin,user,group,native:!!native}
}
export function requireDiscordSameOrigin(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new CreatorDiscordError('Open Discord setup from SlipSurge.',403)
}
