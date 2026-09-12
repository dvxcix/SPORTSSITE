'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check, MessageCircle, Search, UserRoundPlus, X } from 'lucide-react'
import { PageState } from '@/components/layout/PageState'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { createClient } from '@/lib/supabase/client'

type Conversation = {
  id: string
  content: string
  createdAt: string
  unreadCount: number
  lastIsMine: boolean
  isRequest: boolean
  partner: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    avatarRingStyle: 'none' | 'solid' | 'surge' | 'pulse' | 'orbit' | null
    avatarRingColor: string | null
  }
}

export function MessageInbox({ conversations, currentUserId }: { conversations: Conversation[]; currentUserId: string }) {
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<'inbox' | 'requests'>('inbox')
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(() => new Set())
  const [actionError, setActionError] = useState('')
  const supabase = useMemo(() => createClient(), [])
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return conversations.filter(conversation => {
      if (hiddenIds.has(conversation.id)) return false
      const isRequest = conversation.isRequest && !acceptedIds.has(conversation.id)
      if ((section === 'requests') !== isRequest) return false
      if (!needle) return true
      return conversation.partner.username.toLocaleLowerCase().includes(needle)
        || conversation.partner.displayName?.toLocaleLowerCase().includes(needle)
        || conversation.content.toLocaleLowerCase().includes(needle)
    })
  }, [acceptedIds, conversations, hiddenIds, query, section])
  const requestCount = conversations.filter(conversation => conversation.isRequest && !hiddenIds.has(conversation.id) && !acceptedIds.has(conversation.id)).length

  async function setRequestStatus(conversation: Conversation, status: 'accepted' | 'declined') {
    setActionError('')
    if (status === 'accepted') setAcceptedIds(current => new Set(current).add(conversation.id))
    else setHiddenIds(current => new Set(current).add(conversation.id))
    const { error } = await supabase.from('dm_conversation_preferences').upsert({
      user_id: currentUserId, partner_id: conversation.partner.id, status, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,partner_id' })
    if (!error) return
    if (status === 'accepted') setAcceptedIds(current => { const next = new Set(current); next.delete(conversation.id); return next })
    else setHiddenIds(current => { const next = new Set(current); next.delete(conversation.id); return next })
    setActionError('Could not update the request. Try again.')
  }

  return (
    <div className="ss-message-inbox">
      <div className="ss-message-sections" role="tablist" aria-label="Message sections">
        <button type="button" role="tab" aria-selected={section === 'inbox'} onClick={() => setSection('inbox')}><MessageCircle size={13}/> Inbox</button>
        <button type="button" role="tab" aria-selected={section === 'requests'} onClick={() => setSection('requests')}><UserRoundPlus size={13}/> Requests{requestCount > 0 && <b>{requestCount > 9 ? '9+' : requestCount}</b>}</button>
      </div>
      <label className="ss-message-search">
        <span className="sr-only">Search conversations</span>
        <Search size={15} aria-hidden="true" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search conversations…"
          className="ss-message-search-input"
        />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear conversation search"><X size={12} /></button>}
      </label>
      {actionError && <p className="ss-message-request-error" role="alert">{actionError}</p>}

      {filtered.length === 0 ? (
        <PageState
          compact
          title={query ? 'No matching conversations' : section === 'requests' ? 'No message requests' : 'No messages yet'}
          message={query ? 'Try another name or message.' : section === 'requests' ? 'New conversations from people you do not follow appear here.' : 'Start a conversation with another member.'}
          actionLabel={query ? 'Clear search' : section === 'inbox' ? 'Start a DM' : undefined}
          actionHref={query || section === 'requests' ? undefined : '/messages/new'}
          onAction={query ? () => setQuery('') : undefined}
        />
      ) : (
        <div className="ss-conversation-list">
          {filtered.map(conversation => {
            const partner = conversation.partner
            return (
              <div key={conversation.id} className="ss-conversation-request-wrap">
              <Link href={`/messages/${partner.username}`} className={`ss-conversation-row ${conversation.unreadCount ? 'is-unread' : ''}`}>
                <MemberAvatar src={partner.avatarUrl} name={partner.displayName || partner.username} size={46} ringStyle={partner.avatarRingStyle ?? undefined} ringColor={partner.avatarRingColor ?? undefined} />
                <div className="ss-conversation-copy">
                  <div><strong>{partner.displayName || partner.username}</strong><span>@{partner.username}</span></div>
                  <p>{conversation.lastIsMine ? 'You: ' : ''}{conversation.content || 'Open conversation'}</p>
                </div>
                <div className="ss-conversation-meta">
                  <span>
                  {new Date(conversation.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  {conversation.unreadCount > 0 && <b className="ss-conversation-unread">{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</b>}
                  <ArrowUpRight size={14} />
                </div>
              </Link>
              {section === 'requests' && <div className="ss-message-request-actions"><button type="button" onClick={() => void setRequestStatus(conversation, 'accepted')}><Check size={13}/> Accept</button><button type="button" onClick={() => void setRequestStatus(conversation, 'declined')}><X size={13}/> Decline</button></div>}
              </div>
            )
          })}
        </div>
      )}
      {filtered.length > 0 && <div className="ss-message-inbox-foot"><MessageCircle size={12} /> Select a conversation to continue</div>}
    </div>
  )
}
