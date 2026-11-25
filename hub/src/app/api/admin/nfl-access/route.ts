import { NextResponse } from 'next/server'
import { resolveAuthedClient } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { changeNflAccess, readNflAccess } from '@/lib/adminNflAccess'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const { supabase, userId, error: authError } = await resolveAuthedClient()
  if (authError) return { error: authError }
  if (!userId) return { error: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', userId).maybeSingle()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !assurance || (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2')) {
    return { error: NextResponse.json({ error: 'Two-factor verification required' }, { status: 403 }) }
  }
  return { userId }
}

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  return readNflAccess(request, createAdminClient())
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  return changeNflAccess(request, createAdminClient, gate.userId)
}
