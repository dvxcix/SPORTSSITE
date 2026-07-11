'use client'

import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface Story {
  id: string
  media_url: string
  author: { username: string; display_name?: string; avatar_url?: string }
  created_at: string
}

interface StoriesViewerProps {
  stories: Story[]
  initialIndex: number
  onClose: () => void
}

export function StoriesViewer({ stories, initialIndex, onClose }: StoriesViewerProps) {
  const [current, setCurrent] = useState(initialIndex)
  const [progress, setProgress] = useState(0)
  const story = stories[current]

  useEffect(() => {
    setProgress(0)
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval)
          if (current < stories.length - 1) setCurrent(c => c + 1)
          else onClose()
          return 100
        }
        return p + 2
      })
    }, 100)
    return () => clearInterval(interval)
  }, [current])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && current < stories.length - 1) { setCurrent(c => c + 1) }
      if (e.key === 'ArrowLeft' && current > 0) { setCurrent(c => c - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, stories.length])

  if (!story) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={onClose}>
      <div className="relative w-full max-w-sm h-[80vh] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2">
          {stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-none"
                style={{ width: i < current ? '100%' : i === current ? `${progress}%` : '0%' }} />
            </div>
          ))}
        </div>

        {/* Author header */}
        <div className="absolute top-4 left-0 right-0 z-10 flex items-center gap-3 px-4 pt-4">
          <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden border-2 border-white/30 shrink-0">
            {story.author.avatar_url
              ? <img src={story.author.avatar_url} alt="" className="w-full h-full object-cover" />
              : <span className="flex items-center justify-center w-full h-full text-xs font-black text-white">
                  {(story.author.display_name || story.author.username)[0].toUpperCase()}
                </span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">{story.author.display_name || story.author.username}</p>
            <p className="text-xs text-white/60">
              {new Date(story.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Story media */}
        {story.media_url.match(/\.(mp4|webm)$/i)
          ? <video src={story.media_url} className="w-full h-full object-cover" autoPlay muted loop />
          : <img src={story.media_url} alt="" className="w-full h-full object-cover" />
        }

        {/* Navigation zones */}
        <div className="absolute inset-y-0 left-0 w-1/3 cursor-pointer"
          onClick={() => current > 0 ? setCurrent(c => c - 1) : onClose()} />
        <div className="absolute inset-y-0 right-0 w-1/3 cursor-pointer"
          onClick={() => current < stories.length - 1 ? setCurrent(c => c + 1) : onClose()} />

        {/* Arrows */}
        {current > 0 && (
          <button onClick={() => setCurrent(c => c - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white bg-black/30 rounded-full p-1 z-10">
            <ChevronLeft size={20} />
          </button>
        )}
        {current < stories.length - 1 && (
          <button onClick={() => setCurrent(c => c + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white bg-black/30 rounded-full p-1 z-10">
            <ChevronRight size={20} />
          </button>
        )}
      </div>
    </div>
  )
}
