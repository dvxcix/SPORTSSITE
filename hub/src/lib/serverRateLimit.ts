import { createAdminClient } from '@/lib/supabase/admin'

type RateLimitResult = { allowed: boolean; available: boolean }

export async function consumeServerRateLimit(
  userId: string,
  feature: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { data, error } = await createAdminClient().rpc('consume_server_rate_limit', {
    p_user_id: userId,
    p_feature: feature,
    p_max: maxRequests,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    console.error('[serverRateLimit] check failed', { feature, code: error.code })
    return { allowed: false, available: false }
  }
  return { allowed: data === true, available: true }
}
