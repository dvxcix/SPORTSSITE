'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Plus, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StoriesViewer } from './StoriesViewer'
import { MemberAvatar } from './MemberAvatar'

export function StoriesBar() {
  const [stories, setStories] = useState<any[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerStart, setViewerStart] = useState(0)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data } = await supabase
        .from('stories')
        .select('id, author:users(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color), media_url, created_at')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(12)
      setStories((data as any[]) ?? [])
    }
    load()
  }, [supabase])

  function openViewer(idx: number) {
    setViewerStart(idx)
    setViewerOpen(true)
  }

  return (
    <>
      <section className="ss-stories-bar" aria-label="Community stories">
        <div className="ss-stories-heading"><span><Sparkles size={12}/> Stories</span><small>{stories.length ? `${stories.length} live` : 'Share the moment'}</small></div>
        <div className="ss-stories-rail">
          {userId && (
            <Link href="/stories/create" className="ss-story-item is-create">
              <div className="ss-story-ring">
                <Plus size={20} />
              </div>
              <span>Your story</span>
            </Link>
          )}

          {stories.map((s: any, i: number) => (
            <button type="button" key={s.id} onClick={() => openViewer(i)} className="ss-story-item" aria-label={`View ${s.author?.display_name || s.author?.username || 'member'}'s story`}>
              <div className="ss-story-ring">
                <div>
                  <MemberAvatar src={s.author?.avatar_url} name={s.author?.display_name || s.author?.username || 'Member'} size={58} ringStyle={s.author?.avatar_ring_style} ringColor={s.author?.avatar_ring_color} />
                </div>
              </div>
              <span>{s.author?.display_name || s.author?.username}</span>
            </button>
          ))}
        </div>
      </section>

      {viewerOpen && stories.length > 0 && (
        <StoriesViewer
          stories={stories}
          initialIndex={viewerStart}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  )
}
