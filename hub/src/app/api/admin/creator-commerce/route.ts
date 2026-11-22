import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { configureCreatorDelivery, testCreatorDelivery } from '@/lib/creatorWebhookConfig'
import { safeApiError } from '@/lib/safeApiError'
import { writeAdminAudit } from '@/lib/adminAudit'
import { creatorPlatformHealth } from '@/lib/creatorPlatformHealth'

async function operator() {
 const supabase = await createClient()
 const { data: { user } } = await supabase.auth.getUser()
 if (!user) return null
 const { data } = await supabase.from('users').select('account_type').eq('id', user.id).single()
 return data?.account_type === 'admin' ? user : null
}
export async function GET() {
 if (!await operator()) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
 try {
   return NextResponse.json(await creatorPlatformHealth(), { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (cause) { return safeApiError('creator-platform-check', cause, 'The Whop platform connection could not be verified. Check its account and API permissions.', 502) }
}
export async function POST(request: Request) {
 const user = await operator()
 if (!user) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
 try {
   const admin = createAdminClient()
   await configureCreatorDelivery(admin)
   const test = await testCreatorDelivery(admin)
   await writeAdminAudit(admin, { actorUserId: user.id, action: 'creator.delivery_configured', targetType: 'creator_commerce', targetId: 'whop', details: { child_events: true, test_passed: test.success, test_status: test.status }, request })
   return NextResponse.json({ deliveryReady: test.success, testPassed: test.success, testStatus: test.status }, { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (cause) { return safeApiError('creator-platform-connect', cause, 'Creator event delivery could not be configured. Check Whop webhook permissions, then retry.', 502) }
}
