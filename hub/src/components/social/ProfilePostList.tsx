'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { PostCardClient } from './PostCardClient'

interface ProfilePostListProps {
  userId: string
  tab: string
  initialPosts: any[]
  initialCursor: string | null
  initialHasMore: boolean
}

function keyFor(post: any) {
  return post.reposted_by ? `repost-${post.id}-${post.reposted_by.username}` : post.id
}

// Same infinite-scroll treatment as FeedList.tsx, backed by
// fetchProfilePostsPage/GET /api/profile-posts instead of the feed's own
// fetchFeedPage/GET /api/feed — profile posts previously had a hard
// 20-post ceiling with no pagination at all.
export function ProfilePostList({ userId, tab, initialPosts, initialCursor, initialHasMore }: ProfilePostListProps) {
  const [posts, setPosts] = useState(initialPosts)
  const [cursor, setCursor] = useState(initialCursor)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

  useEffect(() => {
    setPosts(initialPosts)
    setCursor(initialCursor)
    setHasMore(initialHasMore)
  }, [userId, tab, initialPosts, initialCursor, initialHasMore])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !cursor) return
    loadingRef.current = true
    setLoading(true)
    try {
      const res = await fetch(`/api/profile-posts?userId=${encodeURIComponent(userId)}&tab=${encodeURIComponent(tab)}&cursor=${encodeURIComponent(cursor)}`)
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
  }, [userId, tab, cursor, hasMore])

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
    <div className="space-y-3">
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
        <p className="text-center text-zinc-600 text-sm py-6">End of posts</p>
      )}
    </div>
  )
}
