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
      // Upsert user record on OAuth sign-in
      await supabase.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        username: data.user.email?.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(),
        display_name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
        avatar_url: data.user.user_metadata?.avatar_url,
        account_type: 'user',
      }, { onConflict: 'id', ignoreDuplicates: true })
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
}
