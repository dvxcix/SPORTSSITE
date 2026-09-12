'use client'

import { useMemo, useState } from 'react'
import { Images, Pin, Search, X } from 'lucide-react'
import { SafeImage } from '@/components/ui/SafeImage'
import type { DMMessage } from './DMRoom'
import styles from './DMConversationTools.module.css'

export type DMToolMode = 'search' | 'pins' | 'media'

export function DMConversationTools({ mode, messages, pinnedMessageIds, onModeChange, onClose, onJump }: {
  mode: DMToolMode
  messages: DMMessage[]
  pinnedMessageIds: Set<string>
  onModeChange: (mode: DMToolMode) => void
  onClose: () => void
  onJump: (messageId: string) => void
}) {
  const [query, setQuery] = useState('')
  const visibleMessages = useMemo(() => {
    if (mode === 'pins') return messages.filter(message => pinnedMessageIds.has(message.id) && !message.is_deleted)
    if (mode === 'media') return messages.filter(message => !message.is_deleted && Boolean(message.media_urls?.length))
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return messages.filter(message => !message.is_deleted).slice(-30).reverse()
    return messages.filter(message => !message.is_deleted && message.content?.toLocaleLowerCase().includes(normalized)).reverse()
  }, [messages, mode, pinnedMessageIds, query])

  const heading = mode === 'search' ? 'Search conversation' : mode === 'pins' ? 'Pinned messages' : 'Shared media'
  const Icon = mode === 'search' ? Search : mode === 'pins' ? Pin : Images

  return (
    <aside className={styles.panel} aria-label={heading}>
      <header><span><Icon size={15} /></span><strong>{heading}</strong><button type="button" onClick={onClose} aria-label="Close conversation tools"><X size={16} /></button></header>
      <div className={styles.tabs} role="tablist" aria-label="Conversation tools">
        <button type="button" role="tab" aria-selected={mode === 'search'} onClick={() => onModeChange('search')}><Search size={13} /> Search</button>
        <button type="button" role="tab" aria-selected={mode === 'pins'} onClick={() => onModeChange('pins')}><Pin size={13} /> Pins</button>
        <button type="button" role="tab" aria-selected={mode === 'media'} onClick={() => onModeChange('media')}><Images size={13} /> Media</button>
      </div>
      {mode === 'search' && (
        <label className={styles.search}><Search size={14} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search messages" aria-label="Search messages" /></label>
      )}
      <div className={mode === 'media' ? styles.mediaGrid : styles.results}>
        {visibleMessages.length === 0 ? (
          <div className={styles.empty}><Icon size={22} /><p>{mode === 'search' && query ? 'No matching messages' : mode === 'pins' ? 'No pinned messages' : mode === 'media' ? 'No shared media' : 'No messages yet'}</p></div>
        ) : visibleMessages.map(message => mode === 'media' ? (
          <button key={message.id} type="button" className={styles.mediaItem} onClick={() => onJump(message.id)} aria-label={`Open media from ${new Date(message.created_at).toLocaleDateString()}`}>
            <SafeImage src={message.media_urls?.[0]} alt="" />
          </button>
        ) : (
          <button key={message.id} type="button" className={styles.result} onClick={() => onJump(message.id)}>
            <span><time>{new Date(message.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>{pinnedMessageIds.has(message.id) && <Pin size={10} />}</span>
            <p>{message.content || (message.media_urls?.length ? 'Shared media' : 'Message')}</p>
          </button>
        ))}
      </div>
    </aside>
  )
}
