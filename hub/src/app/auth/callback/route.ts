import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/feed'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      // Upsert user record on OAuth sign-in, or on email-confirmation
      // completing for a password signup that required it. For the password
      // signup case, the register page couldn't write this row itself (no
      // session existed yet to satisfy RLS), so it stashed the user's real
      // choices in signUp's user metadata instead — prefer those here over
      // the generic email-derived fallback (which stays as the fallback for
      // OAuth providers that never set these fields).
      const meta = data.user.user_metadata ?? {}
      await supabase.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        username: meta.username || data.user.email?.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(),
        display_name: meta.display_name || meta.full_name || data.user.email?.split('@')[0],
        avatar_url: meta.avatar_url,
        sport_preferences: meta.sport_preferences,
        account_type: meta.account_type || 'user',
      }, { onConflict: 'id', ignoreDuplicates: true })
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
}
