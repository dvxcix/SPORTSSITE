'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
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
    <>
      <label className="relative mb-4 block">
        <span className="sr-only">Search conversations</span>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search conversations…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"
        />
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
        <div className="space-y-1">
          {filtered.map(conversation => {
            const partner = conversation.partner
            return (
              <Link key={conversation.id} href={`/messages/${partner.username}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-900 transition-colors group">
                <div className="w-11 h-11 rounded-full bg-zinc-700 shrink-0 flex items-center justify-center text-sm font-black text-white overflow-hidden">
                  {partner.avatarUrl
                    ? <img src={partner.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : (partner.displayName || partner.username || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm">{partner.displayName || partner.username}</p>
                  <p className="text-xs text-zinc-500 truncate">{conversation.content}</p>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">
                  {new Date(conversation.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
