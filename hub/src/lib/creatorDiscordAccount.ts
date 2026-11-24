import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CreatorDiscordError, creatorDiscordIdentity, creatorDiscordRequest } from './creatorDiscord'
import { discordGuildChoices, DISCORD_ID } from './creatorDiscordPolicy'

/** Provider tokens are used only during the consenting user's current session, never stored or logged. */
export async function discordAccountToken(client: SupabaseClient, discordId: string) {
 const { data: { session } } = await client.auth.getSession()
 const token = session?.provider_token
 if (!token) throw new CreatorDiscordError('Reconnect Discord to continue. Your linked account is preserved.', 409, 'discord_reconnect')
 const response = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(12000) })
 if (response.status === 401) throw new CreatorDiscordError('Your Discord authorization expired. Reconnect Discord to continue.', 409, 'discord_reconnect')
 if (!response.ok) throw new CreatorDiscordError('Discord could not verify your account. Try again.', 503)
 const identity = await response.json() as { id?: string }
 if (identity.id !== discordId) throw new CreatorDiscordError('Authorize the same Discord account linked to SlipSurge.', 403, 'discord_reconnect')
 return token
}

export async function creatorDiscordGuildChoices(client: SupabaseClient, admin: SupabaseClient, userId: string) {
 const discordId = await creatorDiscordIdentity(admin, userId)
 const token = await discordAccountToken(client, discordId!)
 const guilds: Parameters<typeof discordGuildChoices>[0] = []
 let after = ''
 for (let page = 0; page < 10; page++) {
  const response = await fetch(`https://discord.com/api/v10/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(12000) })
  if (response.status === 401 || response.status === 403) throw new CreatorDiscordError('Reconnect Discord to choose from the servers you manage.', 409, 'discord_reconnect')
  if (!response.ok) throw new CreatorDiscordError('Your Discord servers could not be loaded. Try again.', 503)
  const batch = await response.json() as Parameters<typeof discordGuildChoices>[0]
  if (!Array.isArray(batch)) throw new CreatorDiscordError('Your Discord servers could not be loaded.', 503)
  guilds.push(...batch)
  if (batch.length < 200) return discordGuildChoices(guilds).sort((a, b) => a.name.localeCompare(b.name))
  after = batch.at(-1)?.id || ''
  if (!DISCORD_ID.test(after)) break
 }
 throw new CreatorDiscordError('Discord returned too many servers. Try again from your community settings.', 503)
}

export async function joinCreatorDiscordGuild(client: SupabaseClient, guildId: string, discordId: string) {
 if (!DISCORD_ID.test(guildId) || !DISCORD_ID.test(discordId)) throw new CreatorDiscordError('Discord access could not be verified.', 400)
 try { await creatorDiscordRequest(`/guilds/${guildId}/members/${discordId}`); return } catch (error) {
  if (!(error instanceof CreatorDiscordError) || error.code !== 'discord_not_found') throw error
 }
 const token = await discordAccountToken(client, discordId)
 const authorization=await fetch('https://discord.com/api/v10/oauth2/@me',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(12000)})
 if(authorization.status===401)throw new CreatorDiscordError('Reconnect Discord to join this server.',409,'discord_reconnect')
 if(!authorization.ok)throw new CreatorDiscordError('Discord authorization could not be checked. Try again.',503)
 const grant=await authorization.json() as {scopes?:string[];application?:{id?:string}}
 if(grant.application?.id!==process.env.DISCORD_APPLICATION_ID)throw new CreatorDiscordError('Discord account connection needs attention. Contact SlipSurge support to check this authorization.',503,'discord_application_mismatch')
 if(!grant.scopes?.includes('guilds.join'))throw new CreatorDiscordError('Reconnect Discord to allow joining this community’s server.',409,'discord_reconnect')
 // Discord also enforces guilds.join on this request. A plain login cannot join a server.
 const response = await creatorDiscordRequest(`/guilds/${guildId}/members/${discordId}`, 'PUT', { access_token: token })
 const member = response.status === 204 ? null : await response.json() as { pending?: boolean }
 if (member?.pending) throw new CreatorDiscordError('Accept this server’s rules in Discord, then check your access again.', 409, 'discord_screening')
}
