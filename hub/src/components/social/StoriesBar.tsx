'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StoriesViewer } from './StoriesViewer'

export function StoriesBar() {
  const [stories, setStories] = useState<any[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerStart, setViewerStart] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data } = await supabase
        .from('stories')
        .select('id, author:users(id, username, display_name, avatar_url), media_url, created_at')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(12)
      setStories((data as any[]) ?? [])
    }
    load()
  }, [])

  function openViewer(idx: number) {
    setViewerStart(idx)
    setViewerOpen(true)
  }

  return (
    <>
      <div className="mb-4 -mx-4 px-4 overflow-x-auto">
        <div className="flex gap-3 pb-1" style={{ minWidth: 'max-content' }}>
          {/* Add story */}
          {userId && (
            <Link href="/stories/create" className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center bg-zinc-900 hover:border-green-500 transition-colors">
                <Plus size={20} className="text-zinc-500" />
              </div>
              <span className="text-[10px] text-zinc-500 font-medium">Your Story</span>
            </Link>
          )}

          {/* Story bubbles */}
          {stories.map((s: any, i: number) => (
            <button key={s.id} onClick={() => openViewer(i)} className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-br from-green-400 to-blue-500">
                <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden">
                  {s.author?.avatar_url
                    ? <img src={s.author.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-lg font-black text-white">
                        {(s.author?.display_name || s.author?.username || '?')[0].toUpperCase()}
                      </span>
                  }
                </div>
              </div>
              <span className="text-[10px] text-zinc-400 font-medium max-w-[64px] truncate text-center">
                {s.author?.display_name || s.author?.username}
              </span>
            </button>
          ))}
        </div>
      </div>

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
