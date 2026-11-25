import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { nativeHandoffKey, openNativeHandoff } from '@/lib/nativeAuthHandoff'

const headers = { 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer' }

export async function POST(request: Request) {
  const key = nativeHandoffKey()
  if (!key) return NextResponse.json({ error: 'Sign-in unavailable' }, { status: 503, headers })
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'Invalid sign-in request' }, { status: 400, headers })
  }

  let handoff
  try {
    const text = await request.text()
    if (text.length > 4096) return NextResponse.json({ error: 'Invalid sign-in request' }, { status: 400, headers })
    const { code, state, verifier } = JSON.parse(text)
    handoff = openNativeHandoff(key, code, state, verifier)
  } catch {
    return NextResponse.json({ error: 'Invalid sign-in request' }, { status: 400, headers })
  }
  if (!handoff) return NextResponse.json({ error: 'Expired or invalid sign-in' }, { status: 401, headers })

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: handoff.tokenHash, type: 'magiclink' })
    if (error || !data.session || data.user?.id !== handoff.userId) {
      return NextResponse.json({ error: 'Expired or invalid sign-in' }, { status: 401, headers })
    }
    const { access_token, refresh_token, expires_at } = data.session
    return NextResponse.json({ access_token, refresh_token, expires_at, user: data.user }, { headers })
  } catch {
    return NextResponse.json({ error: 'Sign-in unavailable' }, { status: 503, headers })
  }
}
