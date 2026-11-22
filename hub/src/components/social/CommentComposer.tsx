'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'
import { LoaderCircle, Send } from 'lucide-react'
import { EmojiPicker } from './EmojiPicker'
import { GifPicker } from './GifPicker'

export function CommentComposer({ value, onChange, onSubmit, onCancel, label = 'Post', placeholder = 'Write a comment…', pending = false, autoFocus = false, inputRef }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void; onCancel?: () => void
  label?: string; placeholder?: string; pending?: boolean; autoFocus?: boolean; inputRef?: RefObject<HTMLTextAreaElement | null>
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null)
  const field = inputRef ?? ownRef
  useLayoutEffect(() => {
    const input = field.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(160, Math.max(48, input.scrollHeight))}px`
  }, [field, value])
  function insert(text: string) {
    const input = field.current, start = input?.selectionStart ?? value.length, end = input?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + text + value.slice(end))
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + text.length, start + text.length) })
  }
  return <fieldset className="ss-comment-composer" disabled={pending} aria-busy={pending}>
    <textarea ref={field} rows={2} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus}
      onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing && value.trim() && !pending) { event.preventDefault(); onSubmit() } }} />
    <div className="ss-comment-composer-tools"><div><EmojiPicker onSelect={insert} /><GifPicker onSelect={url => insert(` ${url} `)} /></div><div>
      {onCancel && <button type="button" className="ss-comment-cancel" onClick={onCancel}>Cancel</button>}
      <button type="button" className="ss-comment-submit" onClick={onSubmit} disabled={!value.trim() || pending} aria-label={pending ? `${label} in progress` : label}>
        {pending ? <LoaderCircle size={15} className="ss-comment-spinner" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}<span>{label}</span>
      </button>
    </div></div>
  </fieldset>
}
