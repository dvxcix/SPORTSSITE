import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasApprovedCreatorAccess } from '@/lib/creator'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWhopPlatform, getWhopPlatformCompanyId, PLATFORM_URL } from '@/lib/whopPlatform'

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
      const company = await whop.companies.create({
        title: profile.display_name || profile.username || 'SlipSurge Creator', email: profile.email || user.email,
        parent_company_id: getWhopPlatformCompanyId(), metadata: { slipsurge_user_id: profile.id, slipsurge_username: profile.username || '' },
      })
      companyId = company.id
      await admin.from('users').update({ whop_connected_company_id: companyId, creator_commerce_status: 'onboarding', creator_commerce_updated_at: new Date().toISOString() }).eq('id', user.id)
    }
    const link = await whop.accountLinks.create({ company_id: companyId, use_case: 'account_onboarding', refresh_url: `${PLATFORM_URL}/creators/studio?onboarding=refresh`, return_url: `${PLATFORM_URL}/creators/studio?onboarding=complete` })
    return NextResponse.json({ url: link.url })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Whop onboarding failed' }, { status: 500 })
  }
}
