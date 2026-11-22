import { cookies } from 'next/headers'
import { createClient } from './supabase'
import { reviewRole } from './database'

/** The local admin adapter observes the same review persona as the page. */
export function createAdminClient() {
  const client = createClient()
  return {
    ...client,
    // Only application access depends on the request's review persona. Shared
    // scoreboards and leaderboards use this adapter inside unstable_cache.
    from: (name: string) => name === 'creator_applications' || name === 'users'
      ? createClient(undefined, undefined, { rolePromise: cookies().then(reviewRole) }).from(name)
      : client.from(name),
  }
}
