import crypto from 'crypto'

// "Sign in with Whop" — OAuth 2.1 + PKCE + OIDC, per docs.whop.com/developer/
// guides/oauth (confirmed directly against that page, not assumed from
// training data). Whop's own SDK (@whop/sdk) does not cover OAuth at all —
// its README only documents API-key-based server calls — so the OAuth leg
// here is deliberately raw fetch() against Whop's documented REST endpoints,
// matching how their own guide implements it.
const WHOP_API_BASE = 'https://api.whop.com'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

export function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generatePkce() {
  const codeVerifier = base64url(crypto.randomBytes(32))
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest())
  return { codeVerifier, codeChallenge }
}

export function randomToken(bytes = 16): string {
  return base64url(crypto.randomBytes(bytes))
}

export function buildAuthorizeUrl({ redirectUri, state, codeChallenge, nonce }: {
  redirectUri: string; state: string; codeChallenge: string; nonce: string
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnv('WHOP_CLIENT_ID'),
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  })
  return `${WHOP_API_BASE}/oauth/authorize?${params.toString()}`
}

export interface WhopTokenResponse {
  access_token: string
  refresh_token: string
  id_token?: string
  token_type: string
  expires_in: number
}

export async function exchangeCodeForToken(code: string, redirectUri: string, codeVerifier: string): Promise<WhopTokenResponse | null> {
  try {
    const res = await fetch(`${WHOP_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: requireEnv('WHOP_CLIENT_ID'),
        client_secret: requireEnv('WHOP_CLIENT_SECRET'),
        code_verifier: codeVerifier,
      }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export interface WhopUserInfo {
  sub: string
  name?: string
  preferred_username?: string
  picture?: string
  email?: string
  email_verified?: boolean
}

export async function fetchWhopUserInfo(accessToken: string): Promise<WhopUserInfo | null> {
  try {
    const res = await fetch(`${WHOP_API_BASE}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// The shape shown in Settings > Connected Accounts and on the public
// profile (see verifiedIdentity.ts's VerifiedIdentity type) — Whop doesn't
// go through Supabase's own identity system, so this is built by hand from
// the same userinfo response every other Whop flow already fetches, instead
// of a second lookup.
export function buildWhopVerifiedIdentity(whopUser: WhopUserInfo): { handle: string; profileUrl: string } {
  const handle = whopUser.preferred_username || whopUser.name || 'Whop'
  return {
    handle,
    profileUrl: whopUser.preferred_username ? `https://whop.com/@${whopUser.preferred_username}` : 'https://whop.com',
  }
}

// Whether this Whop user owns the given Product/access-pass — originally
// just the beta gate (called with WHOP_ACCESS_PASS_ID), now also reused to
// check the separate Discord-community product on the same Whop company
// (see DISCORD_ADVANCED_PRODUCT_ID in auth/whop/callback) — hence
// accessPassId being a parameter instead of only ever reading one env var.
// WHOP_ACCESS_PASS_ID holds a `prod_` ID (confirmed), which matches this
// endpoint's documented `prod_xxxx` = "Product access" resource type — one
// of the stronger signals that this is the right endpoint (see caveat below).
//
// CAVEAT: Whop's own docs gave three different candidate paths for this
// check across different pages (`/me/has_access/:id`, an experimental
// `/api/v1/users/check-user-access`, and this one from their Authentication
// guide) with no official SDK coverage to disambiguate. This is the most
// concretely-documented of the three (full example request/response shape,
// not marked experimental, and its resource-type prefixes line up with the
// real `prod_` ID in use) but still hasn't been exercised against a real
// Whop account — verify against a live login, adjust the path here if it
// 404s/behaves unexpectedly.
export async function checkHasAccess(whopUserId: string, accessToken: string, accessPassId: string): Promise<boolean> {
  if (!accessPassId) return false
  try {
    const res = await fetch(`${WHOP_API_BASE}/api/v1/users/${whopUserId}/access/${accessPassId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return !!data?.has_access
  } catch { return false }
}

// Real bug, confirmed live (2026-07-27): this originally guessed
// `DELETE /api/v2/memberships/:id`, which Whop rejected on every single
// attempt (70 straight 502s in production, zero successes) — the guess was
// wrong on BOTH the verb and the path. Whop's actual documented endpoint
// (docs.whop.com/api-reference/memberships/cancel-membership) is
// `POST /memberships/:id/cancel`, with an optional `cancellation_mode` body
// ('at_period_end' [default] or 'immediate'). Kept on the same /api/v2 base
// as fetchAllWhopMemberships (whopMembershipsFetch.ts, confirmed live) since
// that's the proven-correct version prefix for this exact resource in this
// codebase — Whop's own docs are inconsistent about v1 vs v2 elsewhere.
// Omitting the body relies on the 'at_period_end' default, matching the
// caller's own UI copy ("you'll keep access until period end").
//
// Whop cancels at the end of the current billing period by default (access
// continues, auto-renew stops) rather than revoking immediately — the caller
// should reflect that ("still active until period end") rather than treating
// a successful call as an instant downgrade. The real tier/tier_status flip
// still happens later via the existing membership.deactivated/went_invalid
// webhook branch once Whop actually ends the membership.
export async function cancelWhopMembership(membershipId: string, apiKey: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(`${WHOP_API_BASE}/api/v2/memberships/${membershipId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('[cancelWhopMembership] Whop rejected the cancel request', { membershipId, status: res.status, body: errBody })
      return { ok: false, status: res.status, error: errBody || `Whop returned ${res.status}` }
    }
    return { ok: true }
  } catch (e: any) {
    console.error('[cancelWhopMembership] network error contacting Whop', { membershipId, error: e?.message })
    return { ok: false, status: 0, error: e?.message || 'Network error contacting Whop' }
  }
}
