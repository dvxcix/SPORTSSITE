export type DiscordRole = { id: string; name: string; permissions: string; position: number; managed?: boolean }
export const DISCORD_ID = /^\d{17,22}$/
export const MAX_COMMUNITY_DISCORD_ROLES = 5
export function discordGuildChoices(guilds: { id: string; name: string; icon?: string | null; owner?: boolean; permissions?: string }[]) {
 return guilds.filter(guild => {
  if (!DISCORD_ID.test(guild.id)) return false
  try { return guild.owner === true || !!(BigInt(guild.permissions || '0') & BigInt(40)) } catch { return false }
 }).map(({ id, name, icon }) => ({ id, name, icon: icon && /^[a-zA-Z0-9_]+$/.test(icon) ? `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=64` : null }))
}
const ADMIN = BigInt(8), MANAGE_GUILD = BigInt(32), MANAGE_ROLES = BigInt(268435456)
export function creatorCanManageRoles(roles:DiscordRole[],memberRoles:string[],guildId:string){
 return roles.some(role=>(role.id===guildId||memberRoles.includes(role.id))&&!!(BigInt(role.permissions)&(ADMIN|MANAGE_ROLES)))
}
export function creatorAssignableRoles(guildId:string,roles:DiscordRole[],botRoles:string[],memberRoles:string[],ownsGuild:boolean){
 const assignable=assignableCreatorRoles(guildId,roles,botRoles)
 if(ownsGuild)return assignable
 if(!creatorCanManageRoles(roles,memberRoles,guildId))return []
 const highest=Math.max(0,...roles.filter(role=>memberRoles.includes(role.id)).map(role=>role.position))
 return assignable.filter(role=>role.position<highest)
}
export function managesDiscordGuild(ownerId: string, userId: string, memberRoles: string[], roles: DiscordRole[], guildId: string) {
 if (ownerId === userId) return true
 const permissions=roles.filter(role=>role.id===guildId||memberRoles.includes(role.id)).reduce((value,role)=>value|BigInt(role.permissions),BigInt(0))
 return !!(permissions & (ADMIN | MANAGE_GUILD))
}
export function assignableCreatorRoles(guildId: string, roles: DiscordRole[], botRoles: string[]) {
 const held=roles.filter(role=>role.id===guildId||botRoles.includes(role.id))
 const permissions=held.reduce((value,role)=>value|BigInt(role.permissions),BigInt(0))
 if (!(permissions & (ADMIN | MANAGE_ROLES))) return []
 const highest=Math.max(0,...held.map(role=>role.position))
 // Paid access roles must not grant administrative or moderation powers.
 const privileged=[1,2,3,4,5,7,13,17,19,22,23,24,27,28,29,30,33,34,40,41,51,52].reduce((mask,bit)=>mask|(BigInt(1)<<BigInt(bit)),BigInt(0))
 return roles.filter(role=>role.id!==guildId&&!role.managed&&role.position<highest&&!(BigInt(role.permissions)&privileged))
}
