'use client'

import useSWR, { mutate } from 'swr'
import { createClient } from '@/lib/supabase/client'

export type Badge = { id: string; name: string; icon_url: string; description: string; card_image_url?: string | null }

const badgeCacheKey = 'slipsurge/member-badges'
const noBadges: Badge[] = []

async function fetchAllUserBadges(): Promise<Record<string, Badge[]>> {
  const client = createClient()
  const map: Record<string, Badge[]> = Object.create(null)
  type Assignment = { id:string; user_id:string; badge:Badge|null }
  let cursor: string | null = null
  // The assignment table exceeds the API's single-response row limit.
  // Walk the primary key so inserts cannot shift an offset between pages.
  for (;;) {
    let query = client.from('user_badges')
      .select('id, user_id, badge:badges(id, name, icon_url, description, card_image_url)')
      .order('id', { ascending:true }).limit(500)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query
    // Do not publish an empty or partial result after any failed page.
    if (error) throw error
    const rows = (data ?? []) as unknown as Assignment[]
    for (const row of rows) {
      if (!row.badge) continue
      const list = map[row.user_id] ?? []
      list.push(row.badge)
      map[row.user_id] = list
    }
    if (rows.length < 500) break
    const nextCursor = rows[rows.length-1].id
    if (!nextCursor || nextCursor === cursor) throw new Error('Invalid badge page cursor')
    cursor = nextCursor
  }
  return map
}

export function invalidateBadgeCache() {
  void mutate(badgeCacheKey).catch(() => undefined)
}

export function useUserBadges(userId: string | null | undefined): Badge[] {
  // All mounted identities share one request. Looking up the current ID
  // during render prevents the preceding member's badges flashing on reuse.
  const { data } = useSWR(userId ? badgeCacheKey : null, fetchAllUserBadges, {
    dedupingInterval: 60_000,
    focusThrottleInterval: 60_000,
    shouldRetryOnError: false, // Supabase already retries transient reads.
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })
  return userId ? data?.[userId] ?? noBadges : noBadges
}
