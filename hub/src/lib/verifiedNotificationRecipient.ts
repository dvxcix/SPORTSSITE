import type { SupabaseClient } from '@supabase/supabase-js'

// Profile email can lag an account email change. Never send an optional
// notification until Auth confirms that the target is still the verified
// address for this exact account. Do not cache this security decision.
export async function isVerifiedNotificationRecipient(admin: SupabaseClient, userId: string, profileEmail: unknown, timeoutMs = 5000): Promise<boolean> {
  if (!userId || typeof profileEmail !== 'string' || !profileEmail.trim()) return false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      admin.auth.admin.getUserById(userId),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), Math.max(1, Math.min(timeoutMs, 5000))) }),
    ])
    if (!result) return false
    const { data, error } = result
    const user = data?.user
    return !error && !!user && user.id === userId && typeof user.email === 'string'
      && !!user.email_confirmed_at && user.email === profileEmail
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}
