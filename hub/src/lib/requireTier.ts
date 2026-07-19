import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasTierAccess, hasFullAccessOverride, type Tier } from '@/lib/tiers'

// Same { error?: NextResponse } return shape used by requireAdmin() across
// hub/src/app/api/admin/*/route.ts — call site pattern:
//   const gate = await requireTier('basic'); if (gate.error) return gate.error
export async function requireTier(minTier: Tier): Promise<{ error?: NextResponse; userId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  const { data } = await supabase.from('users').select('tier, account_type').eq('id', user.id).single()
  const userTier = (data?.tier as Tier | undefined) ?? 'free'

  if ((await hasFullAccessOverride(supabase, user.id, data?.account_type)) || hasTierAccess(userTier, minTier)) {
    return { userId: user.id }
  }
  return { error: NextResponse.json({ error: 'Upgrade required' }, { status: 403 }) }
}
