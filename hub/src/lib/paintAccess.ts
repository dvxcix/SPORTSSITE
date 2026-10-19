import 'server-only'
import { NextResponse } from 'next/server'
import { resolveAuthedClient } from '@/lib/requireTier'
import { hasNbaAccess } from '@/lib/nbaAccessPolicy'

// Unlisted is not an access control. Keep page and every NBA data route private.
export async function requirePaintAccess() {
  const { supabase, userId } = await resolveAuthedClient()
  if (!userId) return { error: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }
  const { data, error } = await supabase.from('users').select('account_type').eq('id', userId).maybeSingle()
  if (error || !hasNbaAccess(data?.account_type)) return { error: NextResponse.json({ error: 'Not available' }, { status: 403 }) }
  return { userId }
}
