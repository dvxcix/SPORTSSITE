import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { creatorWhop } from './creatorWhop'
import { getWhopPlatformCompanyId, PLATFORM_URL } from './whopPlatform'
import { WHOP_API_VERSION } from './whopApi'

export const CREATOR_EVENTS = ['account.updated', 'payment.succeeded', 'payment.failed', 'membership.activated', 'membership.deactivated', 'membership.updated', 'membership.cancel_at_period_end_changed', 'refund.created', 'refund.updated']
type ProviderWebhook = { id: string; url: string; enabled: boolean; child_resource_events: boolean; resource_id: string; events: string[]; api_version_date: string | null; webhook_secret?: string | null }
function key() {
 const raw = process.env.CREATOR_WEBHOOK_ENCRYPTION_KEY || process.env.WHOP_WEBHOOK_KEY || process.env.WHOP_PLATFORM_API_KEY || process.env.WHOP_API_KEY
 if (!raw) throw new Error('Creator platform key unavailable')
 return createHash('sha256').update('slipsurge-creator-webhook-v1\0').update(raw).digest()
}
export async function testCreatorDelivery(admin: SupabaseClient) {
 const { data, error } = await admin.from('creator_provider_connections').select('webhook_id,account_id').eq('provider', 'whop').single()
 if (error || data?.account_id !== getWhopPlatformCompanyId()) throw new Error('Creator delivery is not configured')
 // A provider-generated account.updated test validates real signatures without a purchase or financial account.
 const result = await creatorWhop<{ success: boolean; status: number }>(`/webhooks/${encodeURIComponent(data.webhook_id)}/test`, { event: 'account.updated' }, `slipsurge-delivery-test-${data.webhook_id}-${Math.floor(Date.now() / 30_000)}`)
 const success = result.success && result.status === 200
 const { error: saveError } = await admin.from('creator_provider_connections').update({
  delivery_verified_at: success ? new Date().toISOString() : null, last_test_status: result.status,
 }).eq('provider', 'whop').eq('webhook_id', data.webhook_id)
 if (saveError) throw new Error('Creator delivery verification could not be saved')
 return { success, status: result.status }
}
function seal(secret: string) {
 const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv)
 const content = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
 return [iv, cipher.getAuthTag(), content].map(value => value.toString('base64')).join('.')
}
function unseal(value: string) {
 const parts = value.split('.').map(part => Buffer.from(part, 'base64'))
 if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16) throw new Error('Invalid creator webhook configuration')
 const decipher = createDecipheriv('aes-256-gcm', key(), parts[0]); decipher.setAuthTag(parts[1])
 return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString('utf8')
}
export async function getCreatorWebhookSecret(admin: SupabaseClient) {
 if (process.env.WHOP_CREATOR_WEBHOOK_KEY) return process.env.WHOP_CREATOR_WEBHOOK_KEY
 const { data, error } = await admin.from('creator_provider_connections').select('secret_ciphertext').eq('provider', 'whop').maybeSingle()
 if (error || !data) throw new Error('Creator webhook is not configured')
 return unseal(data.secret_ciphertext)
}
async function creatorHookReady(admin: SupabaseClient) {
 const { data, error } = await admin.from('creator_provider_connections').select('webhook_id,account_id').eq('provider', 'whop').maybeSingle()
 if (error || !data || data.account_id !== getWhopPlatformCompanyId()) return false
 // Also prove the stored secret is readable after a deployment/key change.
 await getCreatorWebhookSecret(admin)
 const hook = await creatorWhop<ProviderWebhook>(`/webhooks/${encodeURIComponent(data.webhook_id)}`)
 return hook.enabled && hook.child_resource_events && hook.resource_id === data.account_id
   && hook.url === `${PLATFORM_URL}/api/webhooks/whop-creator` && hook.api_version_date === WHOP_API_VERSION
   && CREATOR_EVENTS.every(event => hook.events.includes(event))
}
export async function creatorDeliveryReady(admin: SupabaseClient) {
 const { data, error } = await admin.from('creator_provider_connections').select('delivery_verified_at,last_test_status,updated_at').eq('provider', 'whop').maybeSingle()
 if (error || !data?.delivery_verified_at || data.last_test_status !== 200 || Date.parse(data.delivery_verified_at) < Date.parse(data.updated_at)) return false
 return creatorHookReady(admin)
}
export async function configureCreatorDelivery(admin: SupabaseClient) {
 const parent = getWhopPlatformCompanyId()
 const root = await creatorWhop<{ id: string }>('/accounts/me')
 if (root.id !== parent) throw new Error('Creator platform account mismatch')
 if (await creatorHookReady(admin)) return
 // Never alter the separate main-tier or add-on webhooks.
 const url = `${PLATFORM_URL}/api/webhooks/whop-creator`
 const hook = await creatorWhop<ProviderWebhook>('/webhooks', {
   resource_id: parent, url, title: 'SlipSurge creator communities', enabled: true, child_resource_events: true,
   api_version_date: WHOP_API_VERSION, events: CREATOR_EVENTS,
 }, `slipsurge-creator-delivery-${parent}`)
 if (!hook.webhook_secret || !hook.id || hook.url !== url) throw new Error('Creator webhook secret unavailable')
 const { error } = await admin.from('creator_provider_connections').upsert({
   provider: 'whop', account_id: parent, webhook_id: hook.id, secret_ciphertext: seal(hook.webhook_secret), updated_at: new Date().toISOString(),delivery_verified_at:null,last_test_status:null,
 }, { onConflict: 'provider' })
 if (error) throw new Error('Creator webhook configuration could not be saved')
 if (!await creatorHookReady(admin)) throw new Error('Creator webhook verification failed')
}
