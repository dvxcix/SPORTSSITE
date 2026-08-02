import { createPublicKey, verify as cryptoVerify } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { effectiveTier, type Tier } from '@slipsurge/core/tiers'
import type { DiscordConfig } from '@/lib/supabase/types'

const API = 'https://discord.com/api/v10'

// Every outbound Discord call goes through this one place — same shape as
// every other external API wrapper in this codebase (Whop, MLB, Savant):
// plain fetch, bot token from env, never imported into a 'use client' file.
async function discordFetch(path: string, init: RequestInit = {}) {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not configured')
  const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
  const res = await fetch(`${API}${path}`, { ...init, headers })
  // Role add/remove during a bulk sync routinely trips Discord's per-route
  // rate limit (confirmed: every call in a 5-concurrent-user batch came back
  // 429) — retry once after the server-specified cooldown instead of just
  // logging and dropping the call.
  if (res.status === 429) {
    const body = await res.clone().json().catch(() => null)
    const retryAfterMs = Math.min(Number(body?.retry_after) || 1, 15) * 1000 + 100
    await new Promise(r => setTimeout(r, retryAfterMs))
    return fetch(`${API}${path}`, { ...init, headers })
  }
  return res
}

export async function getDiscordConfig(admin: SupabaseClient): Promise<DiscordConfig | null> {
  const { data } = await admin.from('discord_config').select('*').eq('id', 1).single()
  return (data as DiscordConfig) ?? null
}

// Best-effort — a Discord hiccup should never fail the caller's real work
// (a webhook handler, a tier grant, a cron). Every call site wraps this in
// its own try/catch anyway, but this swallows internally too so a single
// missing config/token doesn't need a try/catch at every call site.
export async function postToChannel(channelId: string | null | undefined, payload: { content?: string; embeds?: any[] }) {
  if (!channelId) return
  try {
    const res = await discordFetch(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(payload) })
    if (!res.ok) console.error('[discord] postToChannel failed', channelId, res.status, await res.text().catch(() => ''))
  } catch (e) {
    console.error('[discord] postToChannel error', e)
  }
}

export async function postAlert(admin: SupabaseClient, alertKey: 'lineup_confirmed' | 'hr' | 'near_hr' | 'slate' | 'pipeline_health', payload: { content?: string; embeds?: any[] }) {
  const config = await getDiscordConfig(admin)
  if (!config?.enabled) return
  const channelId = config.alert_channels?.[alertKey]
  if (!channelId) return
  await postToChannel(channelId, payload)
}

async function addRole(guildId: string, discordUserId: string, roleId: string): Promise<boolean> {
  const res = await discordFetch(`/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, { method: 'PUT' })
  if (res.ok || res.status === 404) return true
  console.error('[discord] addRole failed', discordUserId, roleId, res.status, await res.text().catch(() => ''))
  return false
}

async function removeRole(guildId: string, discordUserId: string, roleId: string): Promise<boolean> {
  const res = await discordFetch(`/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, { method: 'DELETE' })
  if (res.ok || res.status === 404) return true
  console.error('[discord] removeRole failed', discordUserId, roleId, res.status, await res.text().catch(() => ''))
  return false
}

// Called (best-effort, fire-and-forget) from every place a user's tier can
// change: Whop webhook, addon/main reconcile crons, and the admin
// grant/revoke route. Grants the role for the user's real effective tier
// and strips every other tier role, so a downgrade actually removes access
// instead of just adding the new role on top of the old one.
export async function syncDiscordRoleForUser(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const config = await getDiscordConfig(admin)
    if (!config?.enabled || !config.guild_id) return true
    const { data: user } = await admin
      .from('users')
      .select('discord_id, tier, discord_advanced_claimed, admin_granted_tier')
      .eq('id', userId)
      .single()
    if (!user?.discord_id) return true

    const tier = effectiveTier((user.tier as Tier | undefined) ?? 'free', user.discord_advanced_claimed, user.admin_granted_tier as Tier | null)
    const wantRoleId = config.tier_roles?.[tier]
    const allTierRoleIds = Object.values(config.tier_roles || {}).filter(Boolean) as string[]

    await Promise.all(
      allTierRoleIds
        .filter(roleId => roleId !== wantRoleId)
        .map(roleId => removeRole(config.guild_id as string, user.discord_id as string, roleId))
    )
    // The add is the outcome that actually matters for reporting — removes
    // are best-effort cleanup of stale roles, but a failed add means this
    // member did NOT get the role they're supposed to have.
    if (wantRoleId) return await addRole(config.guild_id, user.discord_id, wantRoleId)
    return true
  } catch (e) {
    console.error('[discord] syncDiscordRoleForUser error', userId, e)
    return false
  }
}

// Supabase's linkIdentity()/OAuth sign-in never surfaces the provider's raw
// ID to the client on its own — it's buried in identity_data on the *auth*
// user record. The admin API's getUserById DOES return identities (with
// identity_data), so this works from any server context (a cron, a webhook,
// this OAuth callback) given just a userId, not just from the request that
// did the linking.
export async function syncDiscordIdentity(admin: SupabaseClient, userId: string) {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data?.user) return
    const identity = data.user.identities?.find((i: any) => i.provider === 'discord')
    if (!identity) return
    const idData = identity.identity_data as any
    const discordId = idData?.provider_id || idData?.sub
    if (!discordId) {
      console.error('[discord] syncDiscordIdentity: linked but no provider_id/sub found', userId, Object.keys(idData || {}))
      return
    }
    const discordUsername = idData?.custom_claims?.global_name || idData?.full_name || idData?.name || idData?.preferred_username || null
    await admin.from('users').update({ discord_id: discordId, discord_username: discordUsername }).eq('id', userId)
  } catch (e) {
    console.error('[discord] syncDiscordIdentity error', userId, e)
  }
}

// Every Interaction POST from Discord (slash commands, buttons, etc.) is
// Ed25519-signed with the app's public key — required to trust it actually
// came from Discord and not a forged request hitting a guessable URL. Node's
// crypto has native Ed25519 support; it just doesn't accept a raw 32-byte
// public key directly, so it's wrapped as a JWK (the standard way to build
// an Ed25519 KeyObject from raw bytes without an extra dependency).
export function verifyDiscordSignature(signature: string | null, timestamp: string | null, rawBody: string): boolean {
  const publicKeyHex = process.env.DISCORD_PUBLIC_KEY
  if (!publicKeyHex || !signature || !timestamp) return false
  try {
    const keyObject = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKeyHex, 'hex').toString('base64url') },
      format: 'jwk',
    })
    return cryptoVerify(null, Buffer.from(timestamp + rawBody), keyObject, Buffer.from(signature, 'hex'))
  } catch (e) {
    console.error('[discord] verifyDiscordSignature error', e)
    return false
  }
}

// Discord gives an interaction a 3-second budget to acknowledge — anything
// that needs a real network call (MLB schedule, DB queries) has to defer
// (type 5) and come back later via this webhook-style edit, which uses the
// per-interaction token, not the bot token.
export async function editDeferredReply(applicationId: string, token: string, payload: { content?: string; embeds?: any[] }) {
  try {
    const res = await fetch(`${API}/webhooks/${applicationId}/${token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) console.error('[discord] editDeferredReply failed', res.status, await res.text().catch(() => ''))
  } catch (e) {
    console.error('[discord] editDeferredReply error', e)
  }
}

export async function registerGlobalCommands(commands: any[]) {
  const appId = process.env.DISCORD_APPLICATION_ID
  if (!appId) throw new Error('DISCORD_APPLICATION_ID is not configured')
  const res = await discordFetch(`/applications/${appId}/commands`, { method: 'PUT', body: JSON.stringify(commands) })
  if (!res.ok) throw new Error(`Discord command registration failed: ${res.status} ${await res.text().catch(() => '')}`)
  return res.json()
}
