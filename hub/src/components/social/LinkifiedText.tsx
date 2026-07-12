'use client'

import Link from 'next/link'
import { useCustomEmojis, parseEmojiShortcodes } from '@/lib/emoji'

// Post/comment content rendered as flat text with zero parsing — an
// "@username" mention was inert: unclickable (separately, see
// FeedComposer/PostCardClient's submitComment for the notification half),
// and a ":shortcode:" was just literal text, standard or custom. This
// handles both: mentions become profile links, shortcodes become the
// matching unicode emoji or an inline <img> for a custom one.
export function LinkifiedText({ text }: { text: string }) {
  const customEmojis = useCustomEmojis()
  const mentionParts = text.split(/(@[a-zA-Z0-9_.]{1,30})/g)

  return (
    <>
      {mentionParts.map((part, i) => {
        if (part.startsWith('@') && part.length > 1) {
          return (
            <Link
              key={i}
              href={`/profile/${part.slice(1)}`}
              onClick={e => e.stopPropagation()}
              style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
            >
              {part}
            </Link>
          )
        }
        const emojiParts = parseEmojiShortcodes(part, customEmojis)
        return (
          <span key={i}>
            {emojiParts.map((seg, j) =>
              typeof seg === 'string' ? seg : (
                <img
                  key={j}
                  src={seg.image_url}
                  alt={`:${seg.code}:`}
                  title={`:${seg.code}:`}
                  style={{ height: '1.2em', width: '1.2em', verticalAlign: '-0.25em', objectFit: 'contain', display: 'inline-block' }}
                />
              )
            )}
          </span>
        )
      })}
    </>
  )
}
