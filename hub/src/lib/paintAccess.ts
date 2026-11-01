import 'server-only'
import { NextResponse } from 'next/server'
import { resolveAuthedClient } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasNbaAccess, NBA_ACCESS_COLUMNS } from '@/lib/nbaAccessPolicy'

// Re-read trusted account fields for each request, including membership revocation.
export async function requirePaintAccess() {
  const { userId, error: authError } = await resolveAuthedClient()
  if (authError) return { error: authError }
  if (!userId) return { error: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }
  // Do not grant private entitlement columns to every database API user.
  // This lookup is limited to the verified caller and is deliberately fresh.
  const { data, error } = await createAdminClient().from('users').select(NBA_ACCESS_COLUMNS).eq('id', userId).maybeSingle()
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
