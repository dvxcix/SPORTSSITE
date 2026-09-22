import 'server-only'
import { NextResponse } from 'next/server'
import { resolveAuthedClient } from '@/lib/requireTier'
import { hasNflAccess } from '@/lib/nflAccessPolicy'

// Uncached database grants: revocation must not wait for JWT/profile refresh.
export async function requireNflAccess() {
  const { supabase, userId } = await resolveAuthedClient()
  if (!userId) return { error: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }
  const { data: profile, error: profileError } = await supabase.from('users')
    .select('account_type').eq('id', userId).maybeSingle()
  if (profileError || !profile) return { error: NextResponse.json({ error: 'Access unavailable' }, { status: 403 }) }
  if (hasNflAccess(profile.account_type, false)) return { userId, isAdmin: true }
  const { data: grant, error } = await supabase.from('nfl_early_access')
    .select('user_id').eq('user_id', userId).maybeSingle()
  if (error) return { error: NextResponse.json({ error: 'Could not check NFL access' }, { status: 503 }) }
  if (!hasNflAccess(profile.account_type, !!grant)) {
    return { error: NextResponse.json({ error: 'NFL early access required' }, { status: 403 }) }
  }
  return { userId, isAdmin: false }
}
