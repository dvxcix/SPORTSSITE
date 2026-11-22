export type DiscordRole = { id: string; name: string; permissions: string; position: number; managed?: boolean }
const ADMIN = BigInt(8), MANAGE_GUILD = BigInt(32), MANAGE_ROLES = BigInt(268435456)
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
