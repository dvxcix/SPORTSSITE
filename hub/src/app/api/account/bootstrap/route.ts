import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Creates the profile for an already-authenticated Auth user. This keeps
// the browser from receiving INSERT privileges on the users table or being
// able to choose role, tier, billing, and provider columns at signup.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const metadata = user.user_metadata ?? {}
  const emailName = user.email?.split('@')[0] ?? `member${user.id.slice(0, 8)}`
  const username = String(metadata.username || emailName)
    .replace(/[^a-z0-9_.]/gi, '')
    .toLowerCase()
    .slice(0, 30)

  const { error } = await createAdminClient().from('users').upsert({
    id: user.id,
    email: user.email,
    username,
    display_name: metadata.display_name || metadata.full_name || emailName,
    avatar_url: metadata.avatar_url || null,
    sport_preferences: Array.isArray(metadata.sport_preferences) ? metadata.sport_preferences : [],
  }, { onConflict: 'id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: 'Could not create profile' }, { status: 500 })
  return NextResponse.json({ ok: true }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
