import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasApprovedCreatorAccess } from '@/lib/creator'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWhopPlatform, getWhopPlatformCompanyId, PLATFORM_URL } from '@/lib/whopPlatform'
import { isTrustedWhopUrl } from '@/lib/whopUrl'

const WHOP_OPERATION_TIMEOUT_MS = 20_000

function withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out`)), WHOP_OPERATION_TIMEOUT_MS)
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('id,email,username,display_name,account_type,whop_connected_company_id').eq('id', user.id).single()
  if (!profile || !await hasApprovedCreatorAccess(supabase, user.id, profile.account_type)) return NextResponse.json({ error: 'Creator approval is required' }, { status: 403 })
  try {
    const whop = getWhopPlatform()
    let companyId = profile.whop_connected_company_id as string | null
    if (!companyId) {
      const company = await withTimeout(whop.companies.create({
        title: profile.display_name || profile.username || 'SlipSurge Creator', email: profile.email || user.email,
        parent_company_id: getWhopPlatformCompanyId(), metadata: { slipsurge_user_id: profile.id, slipsurge_username: profile.username || '' },
      }), 'Whop company creation')
      companyId = company.id
      const { error: profileUpdateError } = await admin
        .from('users')
        .update({ whop_connected_company_id: companyId, creator_commerce_status: 'onboarding', creator_commerce_updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (profileUpdateError) throw new Error('Could not save creator commerce connection')
    }
    const link = await withTimeout(whop.accountLinks.create({ company_id: companyId, use_case: 'account_onboarding', refresh_url: `${PLATFORM_URL}/creators/studio?onboarding=refresh`, return_url: `${PLATFORM_URL}/creators/studio?onboarding=complete` }), 'Whop account link creation')
    if (!isTrustedWhopUrl(link.url)) throw new Error('Whop returned an invalid onboarding destination')
    return NextResponse.json({ url: link.url })
  } catch (error) {
    console.error('[Creator onboarding] provider operation failed', safeProviderError(error))
    return NextResponse.json({ error: 'Creator onboarding is temporarily unavailable. Please try again.' }, { status: 502 })
  }
}
