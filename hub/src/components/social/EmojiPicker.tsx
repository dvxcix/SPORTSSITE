'use client'

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { Search, Smile, X } from 'lucide-react'
import { EMOJI_CATEGORIES, useCustomEmojis, groupCustomEmojisByCategory } from '@/lib/emoji'
import { SafeImage } from '@/components/ui/SafeImage'

const PANEL_WIDTH = 280
const VIEWPORT_MARGIN = 8
const RECENTS_KEY = 'slipsurge:recent-emojis'

// Click inserts the raw unicode character for a standard emoji, or the
// :code: text for a custom one (LinkifiedText renders that back into the
// actual image wherever the post/comment is displayed — see hub/src/lib/
// emoji.ts). The compose box stays a plain textarea/input either way; this
// does NOT live-render a custom emoji's image while typing, only once
// posted, since that would need a contentEditable rich-text box instead of
// a plain text input.
export function EmojiPicker({ onSelect }: { onSelect: (insertText: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recentKeys, setRecentKeys] = useState<string[]>([])
  const customEmojis = useCustomEmojis()
  const customGroups = groupCustomEmojisByCategory(customEmojis)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Panel used to always open upward-left of the trigger button
  // (bottom:110%, left:0) with no regard for the button's actual screen
  // position — fine for a desktop composer with room to spare, but a
  // trigger near the top or right edge of a narrow phone viewport (e.g.
  // this same button sitting just under the topbar, or a reaction button
  // near the right side of a post) pushed the panel up past y=0 and off
  // the right edge, landing it wherever, overlapping unrelated chrome.
  // Measured after render (real panel height varies with emoji group
  // count) and clamped to stay fully on-screen.
  const [pos, setPos] = useState<{ left: number; vertical: 'up' | 'down' } | null>(null)
  const needle = query.trim().toLowerCase()
  const visibleCustomGroups = useMemo(() => customGroups.map(group => ({ ...group, emoji: group.emoji.filter(item => !needle || item.code.includes(needle) || group.label.toLowerCase().includes(needle)) })).filter(group => group.emoji.length), [customGroups, needle])
  const visibleStandardGroups = useMemo(() => EMOJI_CATEGORIES.map(group => ({ ...group, emoji: group.emoji.filter(item => !needle || item.code.includes(needle) || item.char.includes(needle) || group.label.toLowerCase().includes(needle)) })).filter(group => group.emoji.length), [needle])
  const recentEmoji = useMemo(() => recentKeys.map(key => {
    if (key.startsWith('custom:')) {
      const code = key.slice(7)
      const custom = customEmojis.find(item => item.code === code)
      return custom ? { key, code, text: `:${code}:`, imageUrl: custom.image_url } : null
    }
    const code = key.slice(9)
    const standard = EMOJI_CATEGORIES.flatMap(group => group.emoji).find(item => item.code === code)
    return standard ? { key, code, text: standard.char, imageUrl: null } : null
  }).filter((item): item is { key: string; code: string; text: string; imageUrl: string | null } => Boolean(item)), [customEmojis, recentKeys])

  useEffect(() => {
    let stored: string[] = []
    try { stored = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]').filter((item: unknown) => typeof item === 'string').slice(0, 14) } catch { /* ignore corrupt local state */ }
    const timer = window.setTimeout(() => setRecentKeys(stored), 0)
    return () => window.clearTimeout(timer)
  }, [])

  function choose(key: string, text: string) {
    const next = [key, ...recentKeys.filter(item => item !== key)].slice(0, 14)
    setRecentKeys(next)
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)) } catch { /* storage can be unavailable */ }
    onSelect(text)
    setQuery('')
    setOpen(false)
  }

  useLayoutEffect(() => {
    if (!open || !ref.current) { setPos(null); return }
    const btnRect = ref.current.getBoundingClientRect()
    const panelHeight = panelRef.current?.offsetHeight ?? 320

    let left = 0
    const absLeft = btnRect.left + left
    if (absLeft + PANEL_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left -= absLeft + PANEL_WIDTH - (window.innerWidth - VIEWPORT_MARGIN)
    }
    if (btnRect.left + left < VIEWPORT_MARGIN) {
      left = VIEWPORT_MARGIN - btnRect.left
    }

    const vertical: 'up' | 'down' = btnRect.top - panelHeight - VIEWPORT_MARGIN < 0 ? 'down' : 'up'

    setPos({ left, vertical })
  }, [open, customGroups.length])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent',
          color: 'var(--text-3)', cursor: 'pointer',
        }}
        aria-label="Insert emoji"
      >
        <Smile size={18} />
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute', zIndex: 50,
            ...(pos?.vertical === 'down' ? { top: '110%' } : { bottom: '110%' }),
            left: pos?.left ?? 0,
            // Invisible until measured/clamped so it never flashes at the
            // unclamped default position for a frame.
            visibility: pos ? 'visible' : 'hidden',
            width: PANEL_WIDTH, maxHeight: 320, overflowY: 'auto',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)', padding: 10,
          }}>
          <div className="ss-emoji-search"><Search size={13}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search emoji" aria-label="Search emoji"/>{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear emoji search"><X size={12}/></button>}</div>
          {!needle && recentEmoji.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Recent</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {recentEmoji.map(item => <button key={item.key} type="button" title={item.text} onClick={() => choose(item.key, item.text)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer' }}>{item.imageUrl ? <SafeImage src={item.imageUrl} alt={item.code} style={{ width: 20, height: 20, objectFit: 'contain' }} /> : item.text}</button>)}
              </div>
            </div>
          )}
          {visibleCustomGroups.map(group => (
            <div key={group.label} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                {group.label}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {group.emoji.map(e => (
                  <button
                    key={e.code}
                    type="button"
                    title={`:${e.code}:`}
                    onClick={() => choose(`custom:${e.code}`, `:${e.code}:`)}
                    style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer' }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--surface-3)')}
                    onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                  >
                    <SafeImage src={e.image_url} alt={e.code} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {visibleStandardGroups.map(cat => (
            <div key={cat.label} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                {cat.label}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {cat.emoji.map(e => (
                  <button
                    key={e.code}
                    type="button"
                    title={`:${e.code}:`}
                    onClick={() => choose(`standard:${e.code}`, e.char)}
                    style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer' }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--surface-3)')}
                    onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                  >
                    {e.char}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!visibleCustomGroups.length && !visibleStandardGroups.length && <p className="ss-emoji-empty">No matching emoji</p>}
        </div>
      )}
    </div>
  )
}
