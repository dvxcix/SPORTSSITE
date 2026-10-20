import 'server-only'
import { NextResponse } from 'next/server'
import { resolveAuthedClient } from '@/lib/requireTier'
import { hasNbaAccess, NBA_ACCESS_COLUMNS } from '@/lib/nbaAccessPolicy'

// Re-read trusted account fields for each request, including membership revocation.
export async function requirePaintAccess() {
  const { supabase, userId } = await resolveAuthedClient()
  if (!userId) return { error: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }
  const { data, error } = await supabase.from('users').select(NBA_ACCESS_COLUMNS).eq('id', userId).maybeSingle()
  if (error || !data) return { error: NextResponse.json({ error: 'NBA access unavailable' }, { status: 503 }) }
  if (!hasNbaAccess(data)) return { error: NextResponse.json({ error: 'Ultimate membership required', requiredTier: 'ultimate' }, { status: 403 }) }
  return { userId, isAdmin: data.account_type === 'admin' }
}

/** Operational captures and internal model reports are not membership features. */
export async function requirePaintAdmin() {
  const gate = await requirePaintAccess()
  if (gate.error) return gate
  if (!gate.isAdmin) return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  return gate
}
