'use client'

import { EmojiPicker } from '@/components/social/EmojiPicker'

export function MessageReactionBar({
  reactions,
  disabled,
  onToggle,
}: {
  reactions?: Record<string, { count: number; selected: boolean }>
  disabled?: boolean
  onToggle: (emoji: string) => void
}) {
  const entries = Object.entries(reactions ?? {}).filter(([, value]) => value.count > 0)
  if (disabled && entries.length === 0) return null
  return <div className="ss-message-reactions" aria-label="Message reactions">
    {entries.map(([emoji, value]) => <button
      key={emoji}
      type="button"
      data-selected={value.selected || undefined}
      onClick={() => onToggle(emoji)}
      disabled={disabled}
      aria-label={`${emoji} reaction, ${value.count}`}
    ><span>{emoji}</span><b>{value.count}</b></button>)}
    {!disabled ? <EmojiPicker onSelect={onToggle}/> : null}
  </div>
}
