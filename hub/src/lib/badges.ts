'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Badge = { id: string; name: string; icon_url: string; description: string }

// Whole assignment table fetched once and cached module-level (same
// pattern as emoji.ts's custom-emoji cache) — badges show up next to a
// username on posts, comments, profile headers, leaderboard rows, and
// search results, which would otherwise mean a per-user query fired from
// every single one of those render sites on every page. Assignments are
// admin-managed and change rarely, so a page-load-scoped cache is fine.
let badgesByUserCache: Map<string, Badge[]> | null = null
let inflight: Promise<Map<string, Badge[]>> | null = null

async function fetchAllUserBadges(): Promise<Map<string, Badge[]>> {
  if (badgesByUserCache) return badgesByUserCache
  if (!inflight) {
    inflight = (async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('user_badges')
        .select('user_id, badge:badges(id, name, icon_url, description)')
      const map = new Map<string, Badge[]>()
      for (const row of (data ?? []) as any[]) {
        if (!row.badge) continue
        const list = map.get(row.user_id) ?? []
        list.push(row.badge)
        map.set(row.user_id, list)
      }
      badgesByUserCache = map
      inflight = null
      return map
    })()
  }
  return inflight
}

export function invalidateBadgeCache() {
  badgesByUserCache = null
}

export function useUserBadges(userId: string | null | undefined): Badge[] {
  const [badges, setBadges] = useState<Badge[]>(userId && badgesByUserCache ? badgesByUserCache.get(userId) ?? [] : [])
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchAllUserBadges().then(map => { if (!cancelled) setBadges(map.get(userId) ?? []) })
    return () => { cancelled = true }
  }, [userId])
  return badges
}
