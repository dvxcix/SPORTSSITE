import { createClient } from '@/lib/supabase/client'

export class DiscordClientError extends Error {
 constructor(message:string,public code?:string){super(message)}
}
export async function discordApi<T>(path:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(55000),...init})
 const data=await response.json().catch(()=>null)
 if(!response.ok)throw new DiscordClientError(data?.error||'Discord could not complete this request. Try again.',data?.code)
 if(!data)throw new DiscordClientError('Discord returned an incomplete response. Try again.')
 return data as T
}
export async function connectCommunityDiscord(next:string,creator=false){
 const {error}=await createClient().auth.linkIdentity({provider:'discord',options:{
  redirectTo:`${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
  scopes:creator?'identify guilds':'identify guilds.join',
  queryParams:{prompt:'consent'},
 }})
 if(error)throw new DiscordClientError('Discord could not be authorized. Check Settings → Connected accounts, then try again.')
}
