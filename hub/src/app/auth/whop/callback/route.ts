import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCodeForToken, fetchWhopUserInfo, checkHasAccess } from '@/lib/whop'
import { effectiveTier, type Tier } from '@/lib/tiers'
import { syncTierBadge } from '@/lib/tierBadges'

const STATE_COOKIE = 'whop_oauth_state'

// The Discord/community product — same Whop company as WHOP_CLIENT_ID's
// OAuth app (confirmed by the user), just a different product than the
// original beta pass (WHOP_ACCESS_PASS_ID). Holding this product's plan
// (plan_XouplTDWLVzUG) bundles SlipSurge's Advanced tier in for free —
// "claimed" by signing in with Whop, same mechanism as the beta gate below,
// just checked against a second product instead of a hardcoded rejection.
// Hardcoded (not env-configured) since it's stable product config, same as
// every plan id already hardcoded in tiers.ts's WHOP_PLANS.
const DISCORD_ADVANCED_PRODUCT_ID = 'prod_EA8yQduATdG8E'

// Whop redirects back here after the user approves (or denies) the OAuth
// request. Supabase Auth has no native Whop provider, so this can't just
// call exchangeCodeForSession like the Google callback does — instead this
// verifies the Whop side entirely server-to-server (token exchange, profile,
// access-pass check), then bridges into a REAL Supabase session via the
// admin API's magic-link flow (see /auth/whop/complete, which is the step
// that actually sets session cookies — this route alone does not log
// anyone in).
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const loginFailed = (reason: string) => NextResponse.redirect(`${origin}/auth/login?error=${reason}`)

  const cookieStore = await cookies()
  const rawStateCookie = cookieStore.get(STATE_COOKIE)?.value
  cookieStore.delete(STATE_COOKIE)

  if (!code || !state || !rawStateCookie) return loginFailed('whop_auth_failed')

  let stored: { state: string; codeVerifier: string; nonce: string; next: string; mode?: 'link'; linkUserId?: string }
  try {
    stored = JSON.parse(rawStateCookie)
  } catch {
    return loginFailed('whop_auth_failed')
  }
  // CSRF check — the state Whop echoed back must match what we generated
  // and stashed before redirecting the user away.
  if (state !== stored.state) return loginFailed('whop_auth_failed')

  const redirectUri = `${origin}/auth/whop/callback`
  const tokenResponse = await exchangeCodeForToken(code, redirectUri, stored.codeVerifier)
  if (!tokenResponse) return loginFailed('whop_auth_failed')

  const whopUser = await fetchWhopUserInfo(tokenResponse.access_token)
  if (!whopUser || !whopUser.email) return loginFailed('whop_auth_failed')

  // Two independent products can let someone through: the original beta
  // pass, or the Discord-community product (which bundles Advanced tier).
  // Neither write anything yet — betaHasAccess never has (beta access is
  // granted by a one-time manual backfill onto beta_access_active,
  // deliberately decoupled from any live check, see hasFullAccessOverride);
  // discordHasAccess gets written to discord_advanced_claimed below, once
  // we know which SlipSurge account this is.
  const accessPassId = process.env.WHOP_ACCESS_PASS_ID
  const [betaHasAccess, discordHasAccess] = await Promise.all([
    accessPassId ? checkHasAccess(whopUser.sub, tokenResponse.access_token, accessPassId) : Promise.resolve(false),
    checkHasAccess(whopUser.sub, tokenResponse.access_token, DISCORD_ADVANCED_PRODUCT_ID),
  ])

  const admin = createAdminClient()

  // Linking Whop onto an already-signed-in account (started at
  // /auth/whop/login?mode=link, e.g. from Settings > Membership) is a
  // completely different operation from logging in — there's no new
  // account to find-or-create, and "no access to either product" isn't a
  // failure here, just "nothing to grant." Handled entirely separately so
  // it can't fall through into the login branches below and accidentally
  // create a second account for someone who already has one.
  if (stored.mode === 'link' && stored.linkUserId) {
    return handleWhopLink(admin, stored.linkUserId, whopUser.sub, discordHasAccess, origin)
  }

  if (!betaHasAccess && !discordHasAccess) return loginFailed('whop_no_access')

  // Find an existing bridged account by Whop user ID first (stable across
  // email changes), falling back to nothing — a fresh Whop login always
  // needs a fresh Supabase auth.users row if this is the first time we've
  // seen this whop_user_id.
  const { data: existing } = await admin
    .from('users')
    .select('id, email')
    .eq('whop_user_id', whopUser.sub)
    .maybeSingle()

  let authUserId: string
  let authUserEmail: string
  // Only true for a genuinely brand-new Supabase account created below
  // (not an existing bridged user, and not an existing email/password or
  // Google account we're just now linking Whop onto) — those two other
  // cases already have a real account and shouldn't be sent through
  // onboarding again.
  let isNewAccount = false

  if (existing) {
    authUserId = existing.id
    authUserEmail = existing.email
    // Re-synced every login (not just set-once-true) — this is the only
    // check we have without a webhook, so a login after cancelling the
    // Discord plan is also what clears the claim.
    const { error: claimErr } = await admin.from('users').update({ discord_advanced_claimed: discordHasAccess }).eq('id', authUserId)
    if (claimErr) console.error('[whop/callback] failed to sync discord_advanced_claimed', claimErr)
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: whopUser.email,
      email_confirm: true,
      user_metadata: {
        full_name: whopUser.name || whopUser.preferred_username,
        avatar_url: whopUser.picture,
        whop_user_id: whopUser.sub,
      },
      // Without this, createUser() defaults app_metadata.provider to
      // 'email' whenever an email is supplied — indistinguishable from a
      // real public self-signup. The "Allow New Registrations" admin toggle
      // (enforced by a DB trigger on auth.users, see the
      // enforce_registration_toggle migration) only blocks provider IN
      // ('email','google') specifically so Whop-gated access (already its
      // own separate access-pass check above) keeps working even while
      // public registration is switched off.
      app_metadata: { provider: 'whop', providers: ['whop'] },
    })

    if (createError || !created.user) {
      // Most likely cause: this email already has an account (signed up via
      // email/password or Google before ever using Whop) — link the Whop
      // identity to that existing account instead of failing outright.
      // Anything else genuinely wrong falls through to the error redirect.
      const { data: byEmail } = await admin
        .from('users')
        .select('id, email, avatar_url, display_name')
        .eq('email', whopUser.email)
        .maybeSingle()
      if (!byEmail) return loginFailed('whop_auth_failed')
      authUserId = byEmail.id
      authUserEmail = byEmail.email
      // Fill in profile gaps from Whop (avatar/display name) without
      // overwriting anything the person already customized on-site —
      // username isn't touched at all here, existing handles stay put.
      // Best-effort: authUserId/authUserEmail already resolve to a real,
      // working account either way, so a failure here just means the Whop
      // link/avatar backfill didn't take this time (retried next login).
      const { error: linkUpdateErr } = await admin.from('users').update({
        whop_user_id: whopUser.sub,
        avatar_url: byEmail.avatar_url || whopUser.picture,
        display_name: byEmail.display_name || whopUser.name || whopUser.preferred_username,
        discord_advanced_claimed: discordHasAccess,
      }).eq('id', authUserId)
      if (linkUpdateErr) console.error('[whop/callback] failed to link whop_user_id to existing account', linkUpdateErr)
    } else {
      authUserId = created.user.id
      authUserEmail = whopUser.email
      isNewAccount = true

      const { error: profileErr } = await admin.from('users').upsert({
        id: authUserId,
        email: whopUser.email,
        username: whopUser.preferred_username || whopUser.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(),
        display_name: whopUser.name || whopUser.preferred_username || whopUser.email.split('@')[0],
        avatar_url: whopUser.picture,
        account_type: 'user',
        whop_user_id: whopUser.sub,
        discord_advanced_claimed: discordHasAccess,
      }, { onConflict: 'id', ignoreDuplicates: true })
      // Unlike the existing-account branch above, this account has no
      // profile row at all if this fails — a real auth.users row now exists
      // with nothing to back it, so don't bridge them into a broken session.
      if (profileErr) return loginFailed('whop_auth_failed')
    }
  }

  // One unified sync regardless of which branch above resolved authUserId —
  // discordHasAccess is already known from the check up top, just need the
  // account's real purchased tier to fold it in via effectiveTier() before
  // awarding/stripping the Advanced/Ultimate profile badge.
  const { data: tierRow } = await admin.from('users').select('tier').eq('id', authUserId).maybeSingle()
  await syncTierBadge(admin, authUserId, effectiveTier((tierRow?.tier as Tier) ?? 'free', discordHasAccess))

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUserEmail,
  })
  if (linkError || !linkData?.properties?.hashed_token) return loginFailed('whop_auth_failed')

  // First time we've ever seen this person → still goes through onboarding
  // (pre-filled from what Whop already gave us — display name, avatar) just
  // like an email/password or Google signup does. Returning Whop users skip
  // straight to wherever they were headed, same as today.
  const completeUrl = new URL(`${origin}/auth/whop/complete`)
  completeUrl.searchParams.set('token_hash', linkData.properties.hashed_token)
  completeUrl.searchParams.set('next', isNewAccount ? '/onboarding' : (stored.next || '/feed'))
  return NextResponse.redirect(completeUrl.toString())
}

// admin param typed loosely (matches createAdminClient()'s own inferred
// return type) to avoid importing a Supabase generic just for this helper.
async function handleWhopLink(admin: ReturnType<typeof createAdminClient>, linkUserId: string, whopUserId: string, discordHasAccess: boolean, origin: string) {
  const linkFailed = (reason: string) => NextResponse.redirect(`${origin}/settings/membership?whop_link_error=${reason}`)

  // This Whop identity might already be linked to someone — a DIFFERENT
  // SlipSurge account (block it) or this same one (harmless re-link, just
  // proceed and re-sync).
  const { data: existingByWhop } = await admin.from('users').select('id').eq('whop_user_id', whopUserId).maybeSingle()
  if (existingByWhop && existingByWhop.id !== linkUserId) return linkFailed('already_linked_elsewhere')

  const { data: updated, error } = await admin.from('users').update({
    whop_user_id: whopUserId,
    discord_advanced_claimed: discordHasAccess,
  }).eq('id', linkUserId).select('tier').single()
  if (error || !updated) return linkFailed('link_failed')

  await syncTierBadge(admin, linkUserId, effectiveTier((updated.tier as Tier) ?? 'free', discordHasAccess))

  return NextResponse.redirect(`${origin}/settings/membership?whop_linked=1`)
}
