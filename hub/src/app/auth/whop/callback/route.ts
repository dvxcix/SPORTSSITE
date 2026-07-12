import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCodeForToken, fetchWhopUserInfo, checkHasAccess } from '@/lib/whop'

const STATE_COOKIE = 'whop_oauth_state'

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

  let stored: { state: string; codeVerifier: string; nonce: string; next: string }
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

  const hasAccess = await checkHasAccess(whopUser.sub, tokenResponse.access_token)
  if (!hasAccess) return loginFailed('whop_no_access')

  const admin = createAdminClient()

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

  if (existing) {
    authUserId = existing.id
    authUserEmail = existing.email
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
      await admin.from('users').update({
        whop_user_id: whopUser.sub,
        avatar_url: byEmail.avatar_url || whopUser.picture,
        display_name: byEmail.display_name || whopUser.name || whopUser.preferred_username,
      }).eq('id', authUserId)
    } else {
      authUserId = created.user.id
      authUserEmail = whopUser.email

      await admin.from('users').upsert({
        id: authUserId,
        email: whopUser.email,
        username: whopUser.preferred_username || whopUser.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(),
        display_name: whopUser.name || whopUser.preferred_username || whopUser.email.split('@')[0],
        avatar_url: whopUser.picture,
        account_type: 'user',
        whop_user_id: whopUser.sub,
      }, { onConflict: 'id', ignoreDuplicates: true })
    }
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUserEmail,
  })
  if (linkError || !linkData?.properties?.hashed_token) return loginFailed('whop_auth_failed')

  const completeUrl = new URL(`${origin}/auth/whop/complete`)
  completeUrl.searchParams.set('token_hash', linkData.properties.hashed_token)
  completeUrl.searchParams.set('next', stored.next || '/feed')
  return NextResponse.redirect(completeUrl.toString())
}
