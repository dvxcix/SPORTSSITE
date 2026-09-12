'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { X, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { MemberAvatar } from './MemberAvatar'
import { SafeImage } from '@/components/ui/SafeImage'

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
  const [paused, setPaused] = useState(false)
  const [durationMs, setDurationMs] = useState(5000)
  const [touchX, setTouchX] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const story = stories[current]

  const move = useCallback((direction: -1 | 1) => {
    const next = current + direction
    if (next < 0 || next >= stories.length) onClose()
    else setCurrent(next)
  }, [current, onClose, stories.length])

  useEffect(() => {
    setProgress(0)
    if (paused) return
    const interval = window.setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval)
          if (current < stories.length - 1) setCurrent(c => c + 1)
          else onClose()
          return 100
        }
        return p + (5000 / durationMs)
      })
    }, 50)
    return () => clearInterval(interval)
  }, [current, durationMs, onClose, paused, stories.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
      if (e.key === ' ') { e.preventDefault(); setPaused(value => !value) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, move, onClose, stories.length])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (paused) video.pause()
    else void video.play().catch(() => undefined)
  }, [current, paused])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  if (!story) return null

  return (
    <div className="ss-story-viewer" onClick={onClose}>
      <div className="ss-story-stage" role="dialog" aria-modal="true" aria-label={`${story.author.display_name || story.author.username}'s story`} onClick={e => e.stopPropagation()} onTouchStart={event => setTouchX(event.touches[0]?.clientX ?? null)} onTouchEnd={event => { if (touchX === null) return; const delta = (event.changedTouches[0]?.clientX ?? touchX) - touchX; if (Math.abs(delta) > 48) move(delta < 0 ? 1 : -1); setTouchX(null) }}>
        <div className="ss-story-progress">
          {stories.map((_, i) => (
            <button type="button" key={i} onClick={() => setCurrent(i)} aria-label={`Open story ${i + 1}`}><span style={{ width: i < current ? '100%' : i === current ? `${progress}%` : '0%' }} /></button>
          ))}
        </div>

        <header className="ss-story-viewer-head">
          <Link href={`/profile/${story.author.username}`} onClick={onClose}><MemberAvatar src={story.author.avatar_url} name={story.author.display_name || story.author.username} size={34} /></Link>
          <Link href={`/profile/${story.author.username}`} onClick={onClose} className="ss-story-author">
            <strong>{story.author.display_name || story.author.username}</strong>
            <span>
              {new Date(story.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </Link>
          <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play story' : 'Pause story'}>{paused ? <Play size={18}/> : <Pause size={18}/>}</button>
          <button type="button" onClick={onClose} aria-label="Close stories"><X size={20} /></button>
        </header>

        {story.media_url.match(/\.(mp4|webm)$/i)
          ? <video ref={videoRef} key={story.id} src={story.media_url} className="ss-story-media" autoPlay muted playsInline onLoadedMetadata={event => setDurationMs(Math.min(15000, Math.max(3000, event.currentTarget.duration * 1000)))} />
          : <SafeImage src={story.media_url} alt="" className="ss-story-media" />
        }

        {current > 0 && (
          <button type="button" onClick={() => move(-1)} className="ss-story-arrow is-left" aria-label="Previous story">
            <ChevronLeft size={22} />
          </button>
        )}
        {current < stories.length - 1 && (
          <button type="button" onClick={() => move(1)} className="ss-story-arrow is-right" aria-label="Next story">
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  )
}
