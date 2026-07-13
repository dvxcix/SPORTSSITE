import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/feed'

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

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
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
      const { error: upsertErr } = await supabase.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        username: meta.username || data.user.email?.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(),
        display_name: meta.display_name || meta.full_name || data.user.email?.split('@')[0],
        avatar_url: meta.avatar_url,
        sport_preferences: meta.sport_preferences,
        account_type: meta.account_type || 'user',
      }, { onConflict: 'id', ignoreDuplicates: true })
      // For an existing account this upsert is a no-op by design
      // (ignoreDuplicates) — only a brand-new account actually depends on it
      // creating the row. If that fails, there's no profile row at all, and
      // every gated page (including onboarding's own finish()) would just
      // silently match zero rows against a user stuck in limbo. Don't send
      // them into the app in that state.
      if (upsertErr && isNewAccount) {
        return NextResponse.redirect(`${origin}/auth/login?error=profile_setup_failed`)
      }
      return NextResponse.redirect(`${origin}${isNewAccount ? '/onboarding' : next}`)
    }

    if (error && wasAlreadyLoggedIn) {
      const failUrl = new URL(`${origin}${next}`)
      failUrl.searchParams.set('link_error', error.message)
      return NextResponse.redirect(failUrl.toString())
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
}
