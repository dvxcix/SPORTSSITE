'use client'

import { useCustomEmojis, parseEmojiShortcodes } from '@/lib/emoji'
import { SafeImage } from '@/components/ui/SafeImage'

/** Lightweight shortcode renderer for compact previews and reply context. */
export function EmojiText({ text }: { text: string }) {
  const customEmojis = useCustomEmojis()
  return <>{parseEmojiShortcodes(text, customEmojis).map((part, index) => typeof part === 'string'
    ? part
    : <SafeImage key={`${part.code}-${index}`} src={part.image_url} alt={part.code} title={`:${part.code}:`} className="ss-inline-emoji" />)}</>
}
