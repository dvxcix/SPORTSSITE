import { createPublicKey, verify as cryptoVerify } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { effectiveTier, type Tier } from '@slipsurge/core/tiers'
import { normName, resolveNameEntry } from '@slipsurge/core/nameNorm'
import type { DiscordConfig } from '@/lib/supabase/types'
import { safeErrorMetadata } from '@/lib/safeApiError'
import { enqueueOperationalRetry } from '@/lib/operationalRetry'

const API = 'https://discord.com/api/v10'

// Every outbound Discord call goes through this one place — same shape as
// every other external API wrapper in this codebase (Whop, MLB, Savant):
// plain fetch, bot token from env, never imported into a 'use client' file.
async function discordFetch(path: string, init: RequestInit = {}) {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not configured')
  const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
  let res: Response | null = null
  // Role add/remove during a bulk sync routinely trips Discord's per-route
  // rate limit (confirmed: every call in a 5-concurrent-user batch came back
  // 429) — retry once after the server-specified cooldown instead of just
  // logging and dropping the call.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await fetch(`${API}${path}`, { ...init, headers, signal: AbortSignal.timeout(12_000) })
      if (res.status !== 429 && res.status < 500) return res
      if (attempt === 3) break
      const body = res.status === 429 ? await res.clone().json().catch(() => null) : null
      const retryAfterMs = res.status === 429
        ? Math.min(Number(body?.retry_after) || 1, 15) * 1000 + 100
        : Math.min(500 * 2 ** attempt, 4_000)
      await new Promise(r => setTimeout(r, retryAfterMs))
    } catch (error) {
      if (attempt === 3) throw error
      await new Promise(r => setTimeout(r, Math.min(500 * 2 ** attempt, 4_000)))
    }
  }
  return res as Response
}

export async function getDiscordConfig(admin: SupabaseClient): Promise<DiscordConfig | null> {
  const { data } = await admin
    .from('discord_config')
    .select('id,guild_id,alert_channels,tier_roles,enabled,updated_at')
    .eq('id', 1)
    .single()
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
    if (!res.ok) {
      console.error('[discord] postToChannel failed', { status: res.status })
      await enqueueOperationalRetry({ provider: 'discord', operation: 'post_channel_message', payload: { channelId, payload }, error: `Discord returned ${res.status}`, responseStatus: res.status })
    }
  } catch (e) {
    console.error('[discord] postToChannel error', safeErrorMetadata(e))
    await enqueueOperationalRetry({ provider: 'discord', operation: 'post_channel_message', payload: { channelId, payload }, error: e instanceof Error ? e.message : 'Discord request failed' })
  }
}

// Real text/announcement channels the bot can post a message into — used by
// the admin embed composer's channel picker so an admin chooses a real
// channel name instead of pasting a raw ID like every other config field on
// this page requires. Type 0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT; every
// other channel type (voice, category, forum, etc.) can't receive a plain
// message.
export async function getGuildChannels(guildId: string): Promise<{ id: string; name: string }[]> {
  try {
    const res = await discordFetch(`/guilds/${guildId}/channels`)
    if (!res.ok) return []
    const channels = await res.json()
    return (Array.isArray(channels) ? channels : [])
      .filter((c: any) => c.type === 0 || c.type === 5)
      .map((c: any) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (e) {
    console.error('[discord] getGuildChannels error', safeErrorMetadata(e))
    return []
  }
}

// Same POST as postToChannel below, but surfaces real success/failure —
// postToChannel is deliberately fire-and-forget for automated alerts (a
// Discord hiccup should never fail the caller's real work), but the admin
// embed composer is a one-off manual action where the admin genuinely needs
// to know whether their post actually landed.
export async function postToChannelChecked(channelId: string, payload: { content?: string; embeds?: any[] }): Promise<{ ok: boolean; error?: string }> {
  if (!channelId) return { ok: false, error: 'No channel selected' }
  try {
    const res = await discordFetch(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(payload) })
    if (!res.ok) return { ok: false, error: `Discord returned ${res.status}` }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Request failed' }
  }
}

export async function postAlert(admin: SupabaseClient, alertKey: 'lineup_confirmed' | 'hr' | 'near_hr' | 'slate' | 'pipeline_health', payload: { content?: string; embeds?: any[] }) {
  const config = await getDiscordConfig(admin)
  if (!config?.enabled) return
  const channelId = config.alert_channels?.[alertKey]
  if (!channelId) return
  await postToChannel(channelId, payload)
}

export const fmtAmericanOdds = (n: number) => (n > 0 ? `+${n}` : `${n}`)

// Anytime HR odds across the four books Dugout itself shows for this market,
// looked up from a BDL-shaped `{ name, sa: { fanduel, caesars, betmgm,
// fanatics } }` map (built by lineup-confirmed's/hr-alerts' own
// pregame_odds_snapshots read — same normName/resolveNameEntry join every
// other cross-source player match in this codebase uses). Returns undefined
// (not an empty string) when nothing's priced, so the caller can omit the
// line entirely instead of showing a blank one.
export function anytimeHrOddsLine(bdlByName: Record<string, any>, playerName: string): string | undefined {
  const entry = resolveNameEntry(bdlByName, normName(playerName))
  const sa = entry?.sa ?? {}
  const parts = [
    sa.fanduel != null ? `FD ${fmtAmericanOdds(sa.fanduel)}` : null,
    sa.caesars != null ? `Caesars ${fmtAmericanOdds(sa.caesars)}` : null,
    sa.betmgm != null ? `MGM ${fmtAmericanOdds(sa.betmgm)}` : null,
    sa.fanatics != null ? `Fanatics ${fmtAmericanOdds(sa.fanatics)}` : null,
  ].filter(Boolean)
  return parts.length ? `Anytime HR: ${parts.join(' • ')}` : undefined
}

async function addRole(guildId: string, discordUserId: string, roleId: string): Promise<boolean> {
  const res = await discordFetch(`/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, { method: 'PUT' })
  if (res.ok || res.status === 404) return true
  console.error('[discord] addRole failed', { status: res.status })
  return false
}

async function removeRole(guildId: string, discordUserId: string, roleId: string): Promise<boolean> {
  const res = await discordFetch(`/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, { method: 'DELETE' })
  if (res.ok || res.status === 404) return true
  console.error('[discord] removeRole failed', { status: res.status })
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

    for (const roleId of allTierRoleIds.filter(roleId => roleId !== wantRoleId)) {
      await removeRole(config.guild_id as string, user.discord_id as string, roleId)
    }
    // The add is the outcome that actually matters for reporting — removes
    // are best-effort cleanup of stale roles, but a failed add means this
    // member did NOT get the role they're supposed to have.
    if (wantRoleId) return await addRole(config.guild_id, user.discord_id, wantRoleId)
    return true
  } catch (e) {
    console.error('[discord] syncDiscordRoleForUser error', safeErrorMetadata(e))
    return false
  }
}

function extractDiscordIdentity(identity: any): { discordId: string; discordUsername: string | null } | null {
  const idData = identity?.identity_data as any
  const discordId = idData?.provider_id || idData?.sub
  if (!discordId) return null
  const discordUsername = idData?.custom_claims?.global_name || idData?.full_name || idData?.name || idData?.preferred_username || null
  return { discordId, discordUsername }
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
    const extracted = extractDiscordIdentity(identity)
    if (!extracted) {
      console.error('[discord] syncDiscordIdentity: linked identity missing provider identifier')
      return
    }
    await admin.from('users').update({ discord_id: extracted.discordId, discord_username: extracted.discordUsername }).eq('id', userId)
  } catch (e) {
    console.error('[discord] syncDiscordIdentity error', safeErrorMetadata(e))
  }
}

// The ground truth for "who has Discord linked" is Supabase Auth's own
// identities, not users.discord_id — that column is only ever written by
// syncDiscordIdentity above, which only ever ran going forward from a fresh
// link/login. Anyone who linked Discord before that capture existed has a
// real identity but a never-backfilled column, and silently fell out of
// every discord_id-filtered query — including this same bulk sync, before
// this function replaced its old "just filter users.discord_id" approach
// (confirmed via direct DB check: 1104 of 1244 real linked accounts had a
// live Discord identity but a null discord_id, so the old "Sync All Member
// Roles" button had only ever actually covered ~11% of linked members).
// listUsers() already returns each user's identities inline, so this never
// needs a second getUserById round-trip the way syncDiscordIdentity does.
export async function backfillDiscordIdentitiesAndListLinkedUserIds(admin: SupabaseClient): Promise<string[]> {
  const existingIds = new Set<string>()
  {
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      const { data } = await admin.from('users').select('id').range(offset, offset + PAGE - 1)
      if (!data?.length) break
      for (const r of data) existingIds.add(r.id as string)
      if (data.length < PAGE) break
    }
  }

  const rows: { id: string; discord_id: string; discord_username: string | null }[] = []
  const PER_PAGE = 1000
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error || !data?.users?.length) break
    for (const u of data.users) {
      // Guards against an auth user with no matching users row (an
      // incomplete signup) — upserting one here would need every NOT NULL
      // column this route has no business inventing values for.
      if (!existingIds.has(u.id)) continue
      const identity = (u.identities || []).find((i: any) => i.provider === 'discord')
      if (!identity) continue
      const extracted = extractDiscordIdentity(identity)
      if (extracted) rows.push({ id: u.id, discord_id: extracted.discordId, discord_username: extracted.discordUsername })
    }
    if (data.users.length < PER_PAGE) break
  }

  // Upsert only ever SETs discord_id/discord_username on a conflicting row —
  // every one of these ids is already confirmed to exist in `users`, so this
  // always takes the UPDATE path and never touches any other column.
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    await admin.from('users').upsert(rows.slice(i, i + CHUNK), { onConflict: 'id' })
  }
  return rows.map(r => r.id)
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
    console.error('[discord] verifyDiscordSignature error', safeErrorMetadata(e))
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
    if (!res.ok) console.error('[discord] editDeferredReply failed', { status: res.status })
  } catch (e) {
    console.error('[discord] editDeferredReply error', safeErrorMetadata(e))
  }
}

export async function registerGlobalCommands(commands: any[]) {
  const appId = process.env.DISCORD_APPLICATION_ID
  if (!appId) throw new Error('DISCORD_APPLICATION_ID is not configured')
  const res = await discordFetch(`/applications/${appId}/commands`, { method: 'PUT', body: JSON.stringify(commands) })
  if (!res.ok) throw Object.assign(new Error('Discord command registration failed'), { status: res.status })
  return res.json()
}
