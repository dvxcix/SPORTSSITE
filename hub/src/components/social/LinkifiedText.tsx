'use client'

import Link from 'next/link'

// Post/comment content rendered as flat text with zero parsing — an
// "@username" mention was inert: unclickable, and (separately, see
// FeedComposer/PostCardClient's submitComment) never notified anyone
// either. This just handles the rendering half.
export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(@[a-zA-Z0-9_.]{1,30})/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') && part.length > 1 ? (
          <Link
            key={i}
            href={`/profile/${part.slice(1)}`}
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
          >
            {part}
          </Link>
        ) : (
          part
        )
      )}
    </>
  )
}
