'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { X, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { MemberAvatar } from './MemberAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { isStoryVideo, storyBackground, storyTextColor } from '@/lib/storyPresentation'

interface Story {
  id: string
  media_url: string | null
  story_type?: string
  content?: string | null
  bg_color?: string | null
  author: { username: string; display_name?: string; avatar_url?: string; avatar_ring_style?: 'none' | 'solid' | 'surge' | 'pulse' | 'orbit'; avatar_ring_color?: string }
  created_at: string
}

interface StoriesViewerProps {
  stories: Story[]
  initialIndex: number
  onClose: () => void
}

export function StoriesViewer({ stories, initialIndex, onClose }: StoriesViewerProps) {
  const [current, setCurrent] = useState(initialIndex)
  const [progressState, setProgressState] = useState({ id: stories[initialIndex]?.id, value: 0 })
  const progressRef = useRef(progressState)
  const [paused, setPaused] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [mediaDuration, setMediaDuration] = useState<{ id: string; ms: number } | null>(null)
  const [failedMedia, setFailedMedia] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [touchX, setTouchX] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const story = stories[current]
  const progress = progressState.id === story?.id ? progressState.value : 0
  const durationMs = mediaDuration?.id === story?.id ? mediaDuration.ms : 5000

  const move = useCallback((direction: -1 | 1) => {
    const next = current + direction
    if (next < 0 || next >= stories.length) onClose()
    else setCurrent(next)
  }, [current, onClose, stories.length])

  useEffect(() => {
    if (paused || !story || failedMedia === story.id) return
    if (progressRef.current.id !== story.id) progressRef.current = { id: story.id, value: 0 }
    const interval = window.setInterval(() => {
      const value = Math.min(100, progressRef.current.value + 5000 / durationMs)
      progressRef.current = { id: story.id, value }
      setProgressState(progressRef.current)
      if (value >= 100) { clearInterval(interval); move(1) }
    }, 50)
    return () => clearInterval(interval)
  }, [durationMs, failedMedia, move, paused, story])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest('input,textarea,[contenteditable=true]')) return
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
      if (e.key === ' ' && !(e.target instanceof HTMLElement && e.target.closest('button,a[href]'))) { e.preventDefault(); setPaused(value => !value) }
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

  if (!story) return null

  return (
    <ModalSurface open onClose={onClose} backdropClassName="ss-story-viewer" backdropStyle={{ display: 'grid' }} panelClassName="ss-story-stage" label={`${story.author.display_name || story.author.username}'s story`}>
      <div className="ss-story-content" onTouchStart={event => setTouchX(event.touches[0]?.clientX ?? null)} onTouchEnd={event => { if (touchX === null) return; const delta = (event.changedTouches[0]?.clientX ?? touchX) - touchX; if (Math.abs(delta) > 48) move(delta < 0 ? 1 : -1); setTouchX(null) }}>
        <div className="ss-story-progress">
          {stories.map((_, i) => (
            <button type="button" key={i} onClick={() => setCurrent(i)} aria-label={`Open story ${i + 1}`}><span style={{ width: i < current ? '100%' : i === current ? `${progress}%` : '0%' }} /></button>
          ))}
        </div>

        <header className="ss-story-viewer-head">
          <Link href={`/profile/${story.author.username}`} onClick={onClose}><MemberAvatar src={story.author.avatar_url} name={story.author.display_name || story.author.username} size={34} ringStyle={story.author.avatar_ring_style} ringColor={story.author.avatar_ring_color} /></Link>
          <Link href={`/profile/${story.author.username}`} onClick={onClose} className="ss-story-author">
            <strong>{story.author.display_name || story.author.username}</strong>
            <span>
              {new Date(story.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </Link>
          <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play story' : 'Pause story'}>{paused ? <Play size={18}/> : <Pause size={18}/>}</button>
          <button type="button" data-modal-autofocus onClick={onClose} aria-label="Close stories"><X size={20} /></button>
        </header>

        {story.story_type === 'text' || !story.media_url
          ? <div className="ss-story-media" style={{ display: 'grid', placeItems: 'center', padding: 32, background: storyBackground(story.bg_color) }}><p className="ss-story-text" style={{ color: storyTextColor(story.bg_color), fontSize: 26, fontWeight: 600, textAlign: 'center', overflowWrap: 'anywhere' }}>{story.content}</p></div>
          : isStoryVideo(story.media_url)
          ? <video ref={videoRef} key={`${story.id}-${retry}`} src={story.media_url} className="ss-story-media" autoPlay={!paused} muted playsInline onError={() => setFailedMedia(story.id)} onLoadedMetadata={event => setMediaDuration({ id: story.id, ms: Math.min(15000, Math.max(3000, event.currentTarget.duration * 1000)) })} />
          : <SafeImage key={`${story.id}-${retry}`} src={story.media_url} alt="" className="ss-story-media" onFailure={() => setFailedMedia(story.id)} />
        }
        {story.media_url && story.story_type !== 'text' && story.content && <p className="ss-story-caption">{story.content}</p>}
        {failedMedia === story.id && <div className="ss-story-error" role="status"><p>This {isStoryVideo(story.media_url ?? '') ? 'video' : 'photo'} couldn’t load.</p><button type="button" onClick={() => { setFailedMedia(null); setRetry(value => value + 1) }}>Retry {isStoryVideo(story.media_url ?? '') ? 'video' : 'photo'}</button></div>}

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
    </ModalSurface>
  )
}
