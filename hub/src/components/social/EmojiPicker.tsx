'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, Smile, X } from 'lucide-react'
import { EMOJI_CATEGORIES, useCustomEmojis, groupCustomEmojisByCategory } from '@/lib/emoji'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from './EmojiPicker.module.css'
import { FloatingSurface } from '@/components/ui/FloatingSurface'

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
  // Panel used to always open upward-left of the trigger button
  // (bottom:110%, left:0) with no regard for the button's actual screen
  // position — fine for a desktop composer with room to spare, but a
  // trigger near the top or right edge of a narrow phone viewport (e.g.
  // this same button sitting just under the topbar, or a reaction button
  // near the right side of a post) pushed the panel up past y=0 and off
  // the right edge, landing it wherever, overlapping unrelated chrome.
  // Measured after render (real panel height varies with emoji group
  // count) and clamped to stay fully on-screen.
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

  return (
    <div ref={ref} className={styles.root}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={styles.trigger}
        aria-expanded={open}
        aria-label="Insert emoji"
      >
        <Smile size={18} />
      </button>

      <FloatingSurface open={open} anchorRef={ref} onClose={() => setOpen(false)} className={styles.panel} width={300} mobileSheet ariaLabel="Choose an emoji">
          <div className="ss-emoji-search"><Search size={13}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search emoji" aria-label="Search emoji"/>{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear emoji search"><X size={12}/></button>}</div>
          {!needle && recentEmoji.length > 0 && (
            <div className={styles.group}>
              <p className={styles.groupLabel}>Recent</p>
              <div className={styles.grid}>
                {recentEmoji.map(item => <button key={item.key} type="button" title={item.text} onClick={() => choose(item.key, item.text)} className={styles.emoji}>{item.imageUrl ? <SafeImage src={item.imageUrl} alt={item.code} className={styles.customImage} /> : item.text}</button>)}
              </div>
            </div>
          )}
          {visibleCustomGroups.map(group => (
            <div key={group.label} className={styles.group}>
              <p className={styles.groupLabel}>
                {group.label}
              </p>
              <div className={styles.grid}>
                {group.emoji.map(e => (
                  <button
                    key={e.code}
                    type="button"
                    title={`:${e.code}:`}
                    onClick={() => choose(`custom:${e.code}`, `:${e.code}:`)}
                    className={styles.emoji}
                  >
                    <SafeImage src={e.image_url} alt={e.code} className={styles.customImage} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {visibleStandardGroups.map(cat => (
            <div key={cat.label} className={styles.group}>
              <p className={styles.groupLabel}>
                {cat.label}
              </p>
              <div className={styles.grid}>
                {cat.emoji.map(e => (
                  <button
                    key={e.code}
                    type="button"
                    title={`:${e.code}:`}
                    onClick={() => choose(`standard:${e.code}`, e.char)}
                    className={styles.emoji}
                  >
                    {e.char}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!visibleCustomGroups.length && !visibleStandardGroups.length && <p className="ss-emoji-empty">No matching emoji</p>}
      </FloatingSurface>
    </div>
  )
}
