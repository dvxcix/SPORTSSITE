'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, MessageCircle, Search, X } from 'lucide-react'
import { PageState } from '@/components/layout/PageState'

type Conversation = {
  id: string
  content: string
  createdAt: string
  partner: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  }
}

export function MessageInbox({ conversations }: { conversations: Conversation[] }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return conversations
    return conversations.filter(({ partner, content }) =>
      partner.username.toLocaleLowerCase().includes(needle)
      || partner.displayName?.toLocaleLowerCase().includes(needle)
      || content.toLocaleLowerCase().includes(needle))
  }, [conversations, query])

  return (
    <div className="ss-message-inbox">
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

      {filtered.length === 0 ? (
        <PageState
          compact
          title={query ? 'No matching conversations' : 'No messages yet'}
          message={query ? 'Try another name or message.' : 'Start a conversation with another member.'}
          actionLabel={query ? 'Clear search' : 'Start a DM'}
          actionHref={query ? undefined : '/messages/new'}
          onAction={query ? () => setQuery('') : undefined}
        />
      ) : (
        <div className="ss-conversation-list">
          {filtered.map(conversation => {
            const partner = conversation.partner
            return (
              <Link key={conversation.id} href={`/messages/${partner.username}`}
                className="ss-conversation-row">
                <div className="ss-conversation-avatar">
                  {partner.avatarUrl
                    ? <img src={partner.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : (partner.displayName || partner.username || '?')[0].toUpperCase()}
                </div>
                <div className="ss-conversation-copy">
                  <div><strong>{partner.displayName || partner.username}</strong><span>@{partner.username}</span></div>
                  <p>{conversation.content || 'Open conversation'}</p>
                </div>
                <div className="ss-conversation-meta">
                  <span>
                  {new Date(conversation.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <ArrowUpRight size={14} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
      {filtered.length > 0 && <div className="ss-message-inbox-foot"><MessageCircle size={12} /> Select a conversation to continue</div>}
    </div>
  )
}
