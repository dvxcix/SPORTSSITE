'use client'

import { useState, useRef, useEffect } from 'react'
import { Smile } from 'lucide-react'
import { EMOJI_CATEGORIES, useCustomEmojis, groupCustomEmojisByCategory } from '@/lib/emoji'

// Click inserts the raw unicode character for a standard emoji, or the
// :code: text for a custom one (LinkifiedText renders that back into the
// actual image wherever the post/comment is displayed — see hub/src/lib/
// emoji.ts). The compose box stays a plain textarea/input either way; this
// does NOT live-render a custom emoji's image while typing, only once
// posted, since that would need a contentEditable rich-text box instead of
// a plain text input.
export function EmojiPicker({ onSelect }: { onSelect: (insertText: string) => void }) {
  const [open, setOpen] = useState(false)
  const customEmojis = useCustomEmojis()
  const customGroups = groupCustomEmojisByCategory(customEmojis)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
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
        <div style={{
          position: 'absolute', bottom: '110%', left: 0, zIndex: 50,
          width: 280, maxHeight: 320, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)', padding: 10,
        }}>
          {customGroups.map(group => (
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
                    onClick={() => { onSelect(`:${e.code}:`); setOpen(false) }}
                    style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer' }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--surface-3)')}
                    onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                  >
                    <img src={e.image_url} alt={e.code} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {EMOJI_CATEGORIES.map(cat => (
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
                    onClick={() => { onSelect(e.char); setOpen(false) }}
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
        </div>
      )}
    </div>
  )
}
