import { cookies } from 'next/headers'
import { createClient } from './supabase'
import { reviewRole } from './database'

/** The local admin adapter observes the same review persona as the page. */
export function createAdminClient() {
  const client = createClient(undefined,undefined,{service:true})
  return {
    ...client,
    // Only application access depends on the request's review persona. Shared
    // scoreboards and leaderboards use this adapter inside unstable_cache.
    from: (name: string) => name === 'users'
      ? createClient(undefined, undefined, { scopedRole: () => cookies().then(reviewRole),service:true }).from(name)
      : name === 'creator_applications'
      ? createClient(undefined, undefined, { rolePromise: cookies().then(reviewRole),service:true }).from(name)
      : client.from(name),
  }
}
