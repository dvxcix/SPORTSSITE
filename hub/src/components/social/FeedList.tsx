'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { PostCardClient } from './PostCardClient'

interface FeedListProps {
  filter: string
  sport?: string
  initialPosts: any[]
  initialCursor: string | null
  initialHasMore: boolean
  viewerId: string | null
}

function keyFor(post: any) {
  return post.reposted_by ? `repost-${post.id}-${post.reposted_by.username}` : post.id
}

// Replaces the old hard 30-post ceiling (feed/page.tsx used to fetch a flat
// .limit(30) with no way to see anything past it) with real infinite
// scroll, backed by the same fetchFeedPage the initial SSR load uses via
// GET /api/feed — so pagination logic lives in exactly one place.
export function FeedList({ filter, sport, initialPosts, initialCursor, initialHasMore, viewerId }: FeedListProps) {
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

  // Filter changed (tab switch triggers a full page navigation today via
  // <a href>, but this guards the same component instance being reused
  // safely if that ever changes) — reset to the fresh server-rendered set.
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
  }, [filter, sport, initialPosts, initialCursor, initialHasMore, viewerId, viewerMismatch, router])

  const loadMore = useCallback(async () => {
    if (viewerMismatch || loadingRef.current || !hasMore || !cursor) return
    const generation = generationRef.current
    const controller = new AbortController()
    pendingRef.current = controller
    loadingRef.current = true
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`/api/feed?filter=${encodeURIComponent(filter)}&cursor=${encodeURIComponent(cursor)}${sport ? `&sport=${encodeURIComponent(sport)}` : ''}`, { signal: controller.signal })
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
  }, [filter, sport, cursor, hasMore, viewerMismatch])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore()
    }, { rootMargin: '600px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  if (viewerMismatch) return <p role="status" className="ss-feed-end">Updating feed...</p>

  return (
    <div className="ss-feed-list">
      {posts.map((post, i) => (
        <PostCardClient key={keyFor(post)} post={post} index={i} />
      ))}
      <div ref={sentinelRef} className="h-4" />
      {loading && (
        <div className="ss-feed-loading" aria-label="Loading more posts">
          <span><i /><b /><b /></span>
          <span><i /><b /><b /></span>
        </div>
      )}
      {loadError && <p role="status" className="ss-feed-end">Couldn&apos;t load more posts. <button type="button" onClick={loadMore} className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-lime-300 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-300">Try again</button></p>}
      {!hasMore && posts.length === 0 && <p className="ss-feed-end">No posts to show.</p>}
      {!hasMore && posts.length > 0 && (
        <p className="ss-feed-end">You&apos;re all caught up</p>
      )}
    </div>
  )
}
