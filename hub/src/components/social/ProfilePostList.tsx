'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { PostCardClient } from './PostCardClient'
import { SkeletonBlock } from '@/components/ui/feedback-state'

interface ProfilePostListProps {
  userId: string
  tab: string
  initialPosts: any[]
  initialCursor: string | null
  initialHasMore: boolean
  viewerId: string | null
}

function keyFor(post: any) {
  return post.reposted_by ? `repost-${post.id}-${post.reposted_by.username}` : post.id
}

// Same infinite-scroll treatment as FeedList.tsx, backed by
// fetchProfilePostsPage/GET /api/profile-posts instead of the feed's own
// fetchFeedPage/GET /api/feed — profile posts previously had a hard
// 20-post ceiling with no pagination at all.
export function ProfilePostList({ userId, tab, initialPosts, initialCursor, initialHasMore, viewerId }: ProfilePostListProps) {
  const router = useRouter()
  const { user, loading: authLoading, authUnavailable } = useAuth()
  const viewerMismatch = user ? user.id !== viewerId : !authLoading && !authUnavailable && viewerId !== null
  const [posts, setPosts] = useState(initialPosts)
  const [cursor, setCursor] = useState(initialCursor)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const generationRef = useRef(0)
  const pendingRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const generationCounter = generationRef
    const generation = ++generationCounter.current
    pendingRef.current?.abort()
    pendingRef.current = null
    loadingRef.current = false
    setLoading(false)
    setPosts(viewerMismatch ? [] : initialPosts)
    setCursor(initialCursor)
    setHasMore(initialHasMore)
    setLoadError(false)
    if (viewerMismatch) router.refresh()
    return () => {
      if (generationCounter.current === generation) generationCounter.current++
      pendingRef.current?.abort()
      pendingRef.current = null
      loadingRef.current = false
    }
  }, [userId, tab, initialPosts, initialCursor, initialHasMore, viewerId, viewerMismatch, router])

  const loadMore = useCallback(async () => {
    if (viewerMismatch || loadingRef.current || !hasMore || !cursor) return
    const generation = generationRef.current
    const controller = new AbortController()
    pendingRef.current = controller
    loadingRef.current = true
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`/api/profile-posts?userId=${encodeURIComponent(userId)}&tab=${encodeURIComponent(tab)}&cursor=${encodeURIComponent(cursor)}`, { signal: controller.signal })
      if (generation !== generationRef.current || controller.signal.aborted) return
      if (!res.ok) { setLoadError(true); return }
      const body = await res.json()
      if (generation !== generationRef.current || controller.signal.aborted) return
      setPosts(prev => {
        const seen = new Set(prev.map(keyFor))
        const fresh = (body.posts ?? []).filter((p: any) => !seen.has(keyFor(p)))
        return [...prev, ...fresh]
      })
      setCursor(body.nextCursor ?? null)
      setHasMore(!!body.hasMore)
    } catch {
      if (generation === generationRef.current && !controller.signal.aborted) setLoadError(true)
    } finally {
      if (pendingRef.current === controller) {
        pendingRef.current = null
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [userId, tab, cursor, hasMore, viewerMismatch])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore()
    }, { rootMargin: '600px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  if (viewerMismatch) return <p role="status" className="ss-feed-end">Updating posts...</p>

  return (
    <div className="ss-profile-post-list">
      {posts.map((post, i) => (
        <PostCardClient key={keyFor(post)} post={post} index={i} />
      ))}
      <div ref={sentinelRef} className="h-4" />
      {loading && (
        <div className="ss-profile-post-loading" aria-label="Loading more posts"><div className="flex items-center gap-3"><SkeletonBlock className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><SkeletonBlock className="w-32" /><SkeletonBlock className="w-20" /></div></div><SkeletonBlock className="w-full" /><SkeletonBlock className="w-3/4" /></div>
      )}
      {loadError && <p role="status" className="ss-feed-end">Couldn&apos;t load more posts. <button type="button" onClick={loadMore} className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-lime-300 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-300">Try again</button></p>}
      {!hasMore && posts.length === 0 && <p className="ss-feed-end">No posts to show.</p>}
      {!hasMore && posts.length > 0 && (
        <p className="ss-feed-end">You&apos;re all caught up</p>
      )}
    </div>
  )
}
