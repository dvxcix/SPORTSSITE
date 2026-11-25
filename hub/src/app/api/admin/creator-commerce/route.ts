import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { configureCreatorDelivery, testCreatorDelivery } from '@/lib/creatorWebhookConfig'
import { safeApiError } from '@/lib/safeApiError'
import { writeAdminAudit } from '@/lib/adminAudit'
import { creatorPlatformHealth } from '@/lib/creatorPlatformHealth'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

async function operator(request: Request) {
 if (request.headers.has('authorization')) {
  const actor = await adminDecisionActor(request)
  return actor.error ? null : actor.user
 }
 const supabase = await createClient()
 const { data: { user } } = await supabase.auth.getUser()
 if (!user) return null
 const { data } = await supabase.from('users').select('account_type').eq('id', user.id).single()
 return data?.account_type === 'admin' ? user : null
}
export async function GET(request: Request) {
 if (!await operator(request)) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
 try {
   return NextResponse.json(await creatorPlatformHealth(), { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (cause) { return safeApiError('creator-platform-check', cause, 'The Whop platform connection could not be verified. Check its account and API permissions.', 502) }
}
export async function POST(request: Request) {
 const user = await operator(request)
 if (!user) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
 try {
   const admin = createAdminClient()
   await configureCreatorDelivery(admin)
   const test = await testCreatorDelivery(admin)
   await writeAdminAudit(admin, { actorUserId: user.id, action: 'creator.delivery_configured', targetType: 'creator_commerce', targetId: 'whop', details: { child_events: true, test_passed: test.success, test_status: test.status }, request })
   return NextResponse.json({ deliveryReady: test.success, testPassed: test.success, testStatus: test.status }, { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (cause) { return safeApiError('creator-platform-connect', cause, 'Creator event delivery could not be configured. Check Whop webhook permissions, then retry.', 502) }
}
