import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasApprovedCreatorAccess } from '@/lib/creator'
import { getWhopPlatform } from '@/lib/whopPlatform'
import { createAdminClient } from '@/lib/supabase/admin'

const WHOP_OPERATION_TIMEOUT_MS = 20_000

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('Whop payout token request timed out')), WHOP_OPERATION_TIMEOUT_MS)
  })
  return Promise.race([operation, deadline]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function safeProviderError(error: unknown) {
  if (!error || typeof error !== 'object') return { type: typeof error }
  const candidate = error as { name?: unknown; status?: unknown; statusCode?: unknown; code?: unknown }
  return {
    type: typeof candidate.name === 'string' ? candidate.name : error.constructor?.name,
    status: typeof candidate.status === 'number' ? candidate.status : typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
  }
}

export async function POST() {
  const noStoreHeaders = { 'Cache-Control': 'private, no-store' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401, headers: noStoreHeaders })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('whop_connected_company_id,account_type').eq('id', user.id).single()
  if (!profile || !await hasApprovedCreatorAccess(supabase, user.id, profile.account_type) || !profile.whop_connected_company_id) return NextResponse.json({ error: 'Connected creator account not found' }, { status: 403, headers: noStoreHeaders })
  try {
    const response = await withTimeout(getWhopPlatform().accessTokens.create({ company_id: profile.whop_connected_company_id }))
    return NextResponse.json({ token: response.token }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('[Creator payouts] token request failed', safeProviderError(error))
    return NextResponse.json({ error: 'Payout tools are temporarily unavailable. Please try again.' }, { status: 502, headers: noStoreHeaders })
  }
}
