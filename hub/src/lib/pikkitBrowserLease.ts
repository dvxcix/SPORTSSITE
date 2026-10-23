import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

const LEASE_KEY = 'pikkit-persisted-context'
const LEASE_TTL_SECONDS = 360
const CONTEXT_SYNC_COOLDOWN_SECONDS = 8

export type PikkitBrowserLease = {
  ownerId: string
  release: (confirmedIdle?: boolean) => Promise<boolean>
}
export type PikkitBrowserLifecycle = { started: boolean; closed: boolean }

// Browserbase explicitly warns against opening simultaneous sessions with
// one persisted Context: sites can treat that as concurrent logins and
// invalidate the session. This database-backed lease coordinates separate
// Vercel instances, MLB/NFL crons, lineup dispatches, and manual reruns.
export async function acquirePikkitBrowserLease(): Promise<PikkitBrowserLease | null> {
  const ownerId = randomUUID()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('try_acquire_browser_automation_lease', {
    p_lease_key: LEASE_KEY,
    p_owner_id: ownerId,
    p_ttl_seconds: LEASE_TTL_SECONDS,
  })
  if (error) throw new Error(`Pikkit browser lease failed: ${error.message}`)
  if (data !== true) return null

  let releaseResult: Promise<boolean> | undefined
  return {
    ownerId,
    // A startup or shutdown failure can leave a persisted browser alive. Keep
    // its full safety lease instead of reopening the context after eight seconds.
    release: (confirmedIdle = true) => !confirmedIdle ? Promise.resolve(false) : releaseResult ??= (async () => {
      const { data: released, error: releaseError } = await admin.rpc('release_browser_automation_lease', {
        p_lease_key: LEASE_KEY,
        p_owner_id: ownerId,
        p_cooldown_seconds: CONTEXT_SYNC_COOLDOWN_SECONDS,
      })
      if (releaseError) console.error('[pikkit-browser-lease] release failed', { message: releaseError.message })
      return !releaseError && released === true
    })(),
  }
}
