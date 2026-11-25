import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendXConversion, clientIpFromRequest } from '@/lib/xConversion'
import { syncDiscordIdentity, syncDiscordRoleForUser } from '@/lib/discord'
import { safeInternalPath } from '@/lib/safeRedirect'
import { readNativeOAuthRequest, clearNativeOAuthRequest, nativeOAuthComplete, nativeOAuthFailure } from '@/lib/nativeOAuth'
import { isNativeAuthValue } from '@/lib/nativeAuthHandoff'
import { nativeConnectionRedirect } from '@/lib/nativeConnectionRedirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const connectionState = searchParams.get('native_connection_state')
  if (connectionState !== null) {
    if (!isNativeAuthValue(connectionState) || searchParams.getAll('native_connection_state').length !== 1 ||
        searchParams.has('native_state') || searchParams.has('desktop_state') || searchParams.has('discord_community')) {
      return nativeConnectionRedirect(connectionState, 'error', 'connection_failed')
    }
    return code && searchParams.getAll('code').length === 1 && /^[A-Za-z0-9_-]{32,256}$/.test(code) &&
      !searchParams.has('error') && !searchParams.has('error_code')
      ? nativeConnectionRedirect(connectionState, 'code', code)
      : nativeConnectionRedirect(connectionState, 'error', 'connection_failed')
  }
  const nativeState = searchParams.get('native_state')
  const nativeRequest = nativeState === null ? null : await readNativeOAuthRequest(nativeState)
  if (nativeState !== null) {
    await clearNativeOAuthRequest()
    if (!code || !nativeRequest || nativeRequest.provider === 'whop' ||
        searchParams.has('desktop_state') || searchParams.has('discord_community')) {
      return nativeOAuthFailure(nativeState)
    }
  }
  const next = safeInternalPath(searchParams.get('next'), '/launch')
  const discordFlow=searchParams.get('discord_community')
  const discordReauthorize=discordFlow==='reauthorize'
  const discordCommunity=discordReauthorize||discordFlow==='link'
  function discordFailure(reason:string){const target=new URL(next,origin);target.searchParams.delete('discord');target.searchParams.set('link_error',reason);return NextResponse.redirect(target.toString())}
  if(discordCommunity&&!code)return discordFailure('discord_authorization_declined')
  const desktopState = searchParams.get('desktop_state')
  const isDesktop = !!desktopState && /^[0-9a-f-]{36}$/i.test(desktopState)

  if (code) {
    const supabase = await createClient()
    // Captured before the exchange so a failed *link* attempt (someone
    // already logged in, clicking Verify on Settings > Connected Accounts)
    // can be told apart from a failed *sign-in* attempt — a link failure
    // (most commonly: that identity's already linked to a different
    // SlipSurge account, or Manual linking isn't enabled in Supabase) should
    // send an already-authenticated user back to where they came from, not
    // boot them to the login page.
    const { data: preExisting } = await supabase.auth.getUser()
    const wasAlreadyLoggedIn = !!preExisting.user
    const originalSession=discordCommunity?(await supabase.auth.getSession()).data.session:null
    if(discordCommunity&&(!preExisting.user||!originalSession||originalSession.user.id!==preExisting.user.id))return NextResponse.redirect(`${origin}/auth/login?error=discord_reauth_required&next=${encodeURIComponent(next)}`)

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if(discordCommunity&&!error&&data.user&&data.user.id!==preExisting.user!.id){
      // Revoke only the newly exchanged session, then restore the existing account.
      // No creator/group write or role delivery may happen for the wrong account.
      await supabase.auth.signOut({scope:'local'})
      const restored=await supabase.auth.setSession({access_token:originalSession!.access_token,refresh_token:originalSession!.refresh_token})
      if(restored.error)return NextResponse.redirect(`${origin}/auth/login?error=discord_account_mismatch`)
      return discordFailure('discord_account_mismatch')
    }
    if (!error && data.user) {
      // Whop's callback explicitly detects brand-new accounts and forces
      // them through onboarding (isNewAccount) — this generic OAuth path
      // (Discord/X/Google, and email-confirmation completing) had no
      // equivalent, so a first-time signup landed wherever the *calling
      // page* happened to set `next`: /onboarding from the register page's
      // buttons, but straight to /feed from the login page's, since a new
      // user has no way of knowing to click "register" instead of "sign
      // in" first. Checking for an existing profile row here — instead of
      // trusting the caller — makes every entry point behave the same way
      // regardless of which page or provider they used.
      const { data: existingProfile } = await supabase.from('users').select('id').eq('id', data.user.id).maybeSingle()
      const isNewAccount = !existingProfile && !wasAlreadyLoggedIn

      // Upsert user record on OAuth sign-in, or on email-confirmation
      // completing for a password signup that required it. For the password
      // signup case, the register page couldn't write this row itself (no
      // session existed yet to satisfy RLS), so it stashed the user's real
      // choices in signUp's user metadata instead — prefer those here over
      // the generic email-derived fallback (which stays as the fallback for
      // OAuth providers that never set these fields).
      const meta = data.user.user_metadata ?? {}
      // Profile bootstrap is a server-owned operation. Keeping it on the
      // service-role client lets the public users table expose only the
      // harmless profile columns while role, billing, and provider fields
      // remain impossible to write from a browser session.
      const admin = createAdminClient()
      const { error: upsertErr } = await admin.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        username: meta.username || data.user.email?.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(),
        display_name: meta.display_name || meta.full_name || data.user.email?.split('@')[0],
        avatar_url: meta.avatar_url,
        sport_preferences: meta.sport_preferences,
      }, { onConflict: 'id', ignoreDuplicates: true })
      // For an existing account this upsert is a no-op by design
      // (ignoreDuplicates) — only a brand-new account actually depends on it
      // creating the row. If that fails, there's no profile row at all, and
      // every gated page (including onboarding's own finish()) would just
      // silently match zero rows against a user stuck in limbo. Don't send
      // them into the app in that state.
      if (upsertErr && isNewAccount) {
        if (nativeRequest) return nativeOAuthFailure(nativeRequest.state, 'profile-setup-failed')
        return NextResponse.redirect(`${origin}/auth/login?error=profile_setup_failed`)
      }
      if (isNewAccount) {
        // after() (not a bare dangling promise) — runs once this redirect has
        // already gone out, but Vercel still keeps the function alive via
        // waitUntil() until it settles, so a slow/down X API can never delay
        // or fail the signup itself, and also can't get silently truncated
        // the way an un-awaited fetch would risk in a serverless invocation.
        const email = data.user.email
        const ip = clientIpFromRequest(request)
        const userAgent = request.headers.get('user-agent')
        after(() => sendXConversion({
          eventType: 'signup',
          conversionId: `signup-${data.user.id}`,
          email,
          eventSourceUrl: `${origin}/auth/callback`,
          ip,
          userAgent,
        }))
      }
      // Covers both a fresh Discord login/register AND an existing account
      // clicking Verify on Settings > Connected Accounts — both flows funnel
      // through this same exchange. Harmless no-op for X/email/Whop sign-ins
      // (syncDiscordIdentity just finds no discord identity and returns).
      // Runs after the redirect via after() so a slow Discord API can't
      // delay the user getting into the app.
      after(async () => {
        await syncDiscordIdentity(admin, data.user.id)
        await syncDiscordRoleForUser(admin, data.user.id)
      })
      if (nativeRequest) {
        if (!data.user.email) return nativeOAuthFailure(nativeRequest.state, 'email-required')
        const { data: link, error: linkError } = await admin.auth.admin.generateLink({
          type: 'magiclink', email: data.user.email,
        })
        return !linkError && link?.properties?.hashed_token
          ? nativeOAuthComplete(nativeRequest, link.properties.hashed_token, data.user.id)
          : nativeOAuthFailure(nativeRequest.state)
      }
      if (isDesktop && data.user.email) {
        const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email: data.user.email,
        })
        if (!linkError && linkData?.properties?.hashed_token) {
          const desktopUrl = new URL('slipsurge://auth/complete')
          desktopUrl.searchParams.set('token_hash', linkData.properties.hashed_token)
          desktopUrl.searchParams.set('next', isNewAccount ? '/onboarding' : next)
          desktopUrl.searchParams.set('state', desktopState)
          return NextResponse.redirect(desktopUrl.toString())
        }
      }
      return NextResponse.redirect(`${origin}${isNewAccount ? '/onboarding' : next}`)
    }

    if (nativeRequest) return nativeOAuthFailure(nativeRequest.state)
    if (error && wasAlreadyLoggedIn) {
      if(discordCommunity)return discordFailure('provider_link_failed')
      const failUrl = new URL(next, origin)
      failUrl.searchParams.set('link_error', 'provider_link_failed')
      return NextResponse.redirect(failUrl.toString())
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
}
