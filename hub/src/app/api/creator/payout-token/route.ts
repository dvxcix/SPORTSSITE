import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasApprovedCreatorAccess } from '@/lib/creator'
import { getWhopPlatform } from '@/lib/whopPlatform'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('whop_connected_company_id,account_type').eq('id', user.id).single()
  if (!profile || !await hasApprovedCreatorAccess(supabase, user.id, profile.account_type) || !profile.whop_connected_company_id) return NextResponse.json({ error: 'Connected creator account not found' }, { status: 403 })
  try {
    const response = await getWhopPlatform().accessTokens.create({ company_id: profile.whop_connected_company_id })
    return NextResponse.json({ token: response.token })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not open payouts' }, { status: 500 })
  }
}
