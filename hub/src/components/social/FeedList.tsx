'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { PostCardClient } from './PostCardClient'

interface FeedListProps {
  filter: string
  initialPosts: any[]
  initialCursor: string | null
  initialHasMore: boolean
}

function keyFor(post: any) {
  return post.reposted_by ? `repost-${post.id}-${post.reposted_by.username}` : post.id
}

// Replaces the old hard 30-post ceiling (feed/page.tsx used to fetch a flat
// .limit(30) with no way to see anything past it) with real infinite
// scroll, backed by the same fetchFeedPage the initial SSR load uses via
// GET /api/feed — so pagination logic lives in exactly one place.
export function FeedList({ filter, initialPosts, initialCursor, initialHasMore }: FeedListProps) {
  const [posts, setPosts] = useState(initialPosts)
  const [cursor, setCursor] = useState(initialCursor)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

  // Filter changed (tab switch triggers a full page navigation today via
  // <a href>, but this guards the same component instance being reused
  // safely if that ever changes) — reset to the fresh server-rendered set.
  useEffect(() => {
    setPosts(initialPosts)
    setCursor(initialCursor)
    setHasMore(initialHasMore)
  }, [filter, initialPosts, initialCursor, initialHasMore])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !cursor) return
    loadingRef.current = true
    setLoading(true)
    try {
      const res = await fetch(`/api/feed?filter=${encodeURIComponent(filter)}&cursor=${encodeURIComponent(cursor)}`)
      if (!res.ok) { setHasMore(false); return }
      const body = await res.json()
      setPosts(prev => {
        const seen = new Set(prev.map(keyFor))
        const fresh = (body.posts ?? []).filter((p: any) => !seen.has(keyFor(p)))
        return [...prev, ...fresh]
      })
      setCursor(body.nextCursor ?? null)
      setHasMore(!!body.hasMore)
    } catch {
      setHasMore(false)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [filter, cursor, hasMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore()
    }, { rootMargin: '600px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <div className="ss-feed-list space-y-3">
      {posts.map((post, i) => (
        <PostCardClient key={keyFor(post)} post={post} index={i} />
      ))}
      <div ref={sentinelRef} className="h-4" />
      {loading && (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-green-500 rounded-full animate-spin" />
        </div>
      )}
      {!hasMore && posts.length > 0 && (
        <p className="text-center text-zinc-600 text-sm py-6">You're all caught up</p>
      )}
    </div>
  )
}
