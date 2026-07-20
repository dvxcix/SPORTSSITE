// Maps a social_platforms.key to the identity provider that can verify it.
// Discord and X go through Supabase's own OAuth identity linking
// (linkIdentity/unlinkIdentity, handled in ProfileForm). 'whop' is NOT a
// Supabase-native provider — Whop OAuth is hand-rolled (see whop.ts's top
// comment) — so it's verified through a separate flow
// (/auth/whop/login?mode=link) and unlinked through /api/whop/unlink, but
// still shows in this same Connected Accounts list once linked, keyed the
// same way in users.verified_identities.
export const PROVIDER_BY_PLATFORM_KEY: Record<string, 'discord' | 'x' | 'whop'> = {
  x_twitter: 'x',
  discord: 'discord',
  whop: 'whop',
}
export const PLATFORM_KEY_BY_PROVIDER: Record<'discord' | 'x' | 'whop', string> = {
  discord: 'discord',
  x: 'x_twitter',
  whop: 'whop',
}

export type VerifiedIdentity = { handle: string; profileUrl: string }

// Supabase normalizes some OAuth fields (full_name, avatar_url, email) but
// not everything — provider-specific raw fields (Discord's username, X's
// user_name) pass through identity_data under whatever key that provider's
// own userinfo response used.
//
// Confirmed against a real linked Discord identity — its identity_data was:
//   { full_name: 'parlaypartying', name: 'parlaypartying#0',
//     custom_claims: { global_name: 'IS IT PARTY' }, provider_id: '...', ... }
// full_name is Discord's actual unique @username; custom_claims.global_name
// is just a changeable display nickname (can contain spaces/emoji, isn't
// unique) — that's why it's tried last, not first.
export function extractIdentityHandle(provider: 'discord' | 'x', data: Record<string, any>): VerifiedIdentity | null {
  if (!data) return null
  if (provider === 'x') {
    const handle = data.user_name || data.preferred_username || data.screen_name || data.username
    if (!handle) return null
    const clean = String(handle).replace(/^@/, '')
    return { handle: `@${clean}`, profileUrl: `https://x.com/${clean}` }
  }
  // discord
  const handle = data.full_name || data.username || data.preferred_username
    || data.name?.replace(/#0$/, '') || data.custom_claims?.global_name
  const id = data.provider_id || data.sub || data.id
  if (!handle) return null
  return { handle, profileUrl: id ? `https://discord.com/users/${id}` : `https://discord.com` }
}
