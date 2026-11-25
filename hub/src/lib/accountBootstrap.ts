import 'server-only'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export async function bootstrapAccount(user: User) {
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
