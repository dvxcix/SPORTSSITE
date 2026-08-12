import { createAdminClient } from '@/lib/supabase/admin'

type RateLimitResult = { allowed: boolean; available: boolean }

const SERVER_RATE_LIMIT_FEATURE = /^[a-z0-9_-]{2,40}$/

export async function consumeServerRateLimit(
  userId: string,
  feature: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  // Keep this contract aligned with consume_server_rate_limit(). Invalid
  // feature names are a configuration failure, not evidence that a member
  // exceeded a limit. Treating them as unavailable prevents a future caller
  // typo from becoming a misleading 429 for every request.
  if (!SERVER_RATE_LIMIT_FEATURE.test(feature)) {
    console.error('[serverRateLimit] invalid feature name', { feature })
    return { allowed: false, available: false }
  }

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
