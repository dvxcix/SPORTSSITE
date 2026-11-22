import 'server-only'
import { creatorWhop } from './creatorWhop'
import { getWhopPlatformCompanyId, whopPlatformConfiguration } from './whopPlatform'
import { creatorDeliveryReady } from './creatorWebhookConfig'
import { createAdminClient } from './supabase/admin'

/** Same credential resolution as payment requests; never return credentials or provider bodies. */
export async function creatorPlatformHealth() {
  const configured = whopPlatformConfiguration()
  try {
    const root = await creatorWhop<{ id: string; capabilities?: object | null }>('/accounts/me')
    const accountMatches = root.id === getWhopPlatformCompanyId()
    return { ...configured, verified: true, accountMatches, canReadCapabilities: !!root.capabilities, deliveryReady: accountMatches && await creatorDeliveryReady(createAdminClient()) }
  } catch {
    return { ...configured, verified: false, accountMatches: false, canReadCapabilities: false, deliveryReady: false }
  }
}
