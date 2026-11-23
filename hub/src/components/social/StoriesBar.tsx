'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Plus, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StoriesViewer } from './StoriesViewer'
import { MemberAvatar } from './MemberAvatar'
import { useAuth } from '@/context/AuthContext'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { groupStories } from '@/lib/storyGroups'

export function StoriesBar() {
  const { profile } = useAuth()
  const showMlb = !MLB_HIBERNATING || profile?.account_type === 'admin'
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
        .select('id, sport, author:users(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color), media_url, story_type, content, bg_color, created_at')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(12)
      setStories((data as any[]) ?? [])
    }
    load()
  }, [supabase])

  const groups = groupStories(stories.filter(story => showMlb || story.sport?.toUpperCase() !== 'MLB'))
  const visibleStories = groups.flatMap(group => group.stories)

  function openViewer(idx: number) {
    setViewerStart(idx)
    setViewerOpen(true)
  }

  return (
    <>
      <section className="ss-stories-bar" aria-label="Community stories" data-empty={visibleStories.length === 0}>
        <div className="ss-stories-heading"><span><Sparkles size={12}/> Stories</span><small>{visibleStories.length ? `${visibleStories.length} live` : 'Share the moment'}</small></div>
        <div className="ss-stories-rail">
          {userId && (
            <Link href="/stories/create" className="ss-story-item is-create">
              <div className="ss-story-ring">
                <Plus size={20} />
              </div>
              <span>Your story</span>
            </Link>
          )}

          {groups.map(({stories:items,start}) => { const s=items[0]; return (
            <button type="button" key={s.id} onClick={() => openViewer(start)} className="ss-story-item" aria-label={`View ${s.author?.display_name || s.author?.username || 'member'}'s ${items.length > 1 ? `${items.length} stories` : 'story'}`}>
              <div className="ss-story-ring">
                <div>
                  <MemberAvatar src={s.author?.avatar_url} name={s.author?.display_name || s.author?.username || 'Member'} size={58} ringStyle={s.author?.avatar_ring_style} ringColor={s.author?.avatar_ring_color} />
                </div>
              </div>
              {items.length > 1 && <small className="ss-story-count" aria-hidden="true">{items.length}</small>}
              <span>{s.author?.display_name || s.author?.username}</span>
            </button>
          )})}
        </div>
      </section>

      {viewerOpen && visibleStories.length > 0 && (
        <StoriesViewer
          key={showMlb ? 'all-sports' : 'active-sports'}
          stories={visibleStories}
          initialIndex={Math.min(viewerStart, visibleStories.length - 1)}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  )
}
