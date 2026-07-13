'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/supabase/types'
import { Send, TrendingUp } from 'lucide-react'
import { EmojiPicker } from '@/components/social/EmojiPicker'

interface ChatRoomProps {
  channelId: string
  channelName: string
  initialMessages: Message[]
  currentUserId?: string
}

export function ChatRoom({ channelId, initialMessages, currentUserId }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  function insertAtCursor(insertion: string) {
    const el = inputRef.current
    const start = el?.selectionStart ?? input.length
    const end = el?.selectionEnd ?? input.length
    const next = input.slice(0, start) + insertion + input.slice(end)
    setInput(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + insertion.length, start + insertion.length)
    })
  }

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`,
      }, async (payload) => {
        const newMsg = payload.new as Message
        // Fetch sender info
        const { data: sender } = await supabase
          .from('users')
          .select('id,username,display_name,avatar_url,is_verified,account_type')
          .eq('id', newMsg.sender_id)
          .single()
        setMessages(prev => [...prev, { ...newMsg, sender: sender as Message['sender'] ?? undefined }])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [channelId, supabase])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || !currentUserId || sending) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      channel_id: channelId,
      sender_id: currentUserId,
      content: input.trim(),
      message_type: 'text',
    })
    // Only clear the input once the message actually saved — clearing it
    // unconditionally (the previous behavior) silently discarded whatever
    // was typed if the insert failed, with no way to tell it didn't send.
    if (!error) setInput('')
    setSending(false)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((msg, i) => {
          const isOwn = msg.sender_id === currentUserId
          const showAvatar = i === 0 || messages[i - 1].sender_id !== msg.sender_id
          return (
            <div key={msg.id} className={`flex gap-3 ${showAvatar ? 'mt-4' : 'mt-0.5'}`}>
              {showAvatar ? (
                <div className="w-8 h-8 rounded-full bg-zinc-700 shrink-0 flex items-center justify-center text-xs font-bold text-white">
                  {(msg.sender?.display_name || msg.sender?.username || '?')[0].toUpperCase()}
                </div>
              ) : (
                <div className="w-8 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {showAvatar && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className={`text-sm font-bold ${isOwn ? 'text-green-400' : 'text-white'}`}>
                      {msg.sender?.display_name || msg.sender?.username || 'Unknown'}
                    </span>
                    {msg.sender?.is_verified && <span className="text-green-400 text-xs">✓</span>}
                    <span className="text-xs text-zinc-600">
                      {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {msg.pick_data ? (
                  <div className="inline-block bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 text-sm">
                    <div className="flex items-center gap-1 text-yellow-400 text-xs font-bold mb-1">
                      <TrendingUp size={10} /> PICK
                    </div>
                    <p className="font-semibold text-white">{msg.pick_data.team}</p>
                    <p className="text-xs text-zinc-400">{msg.pick_data.line} · {msg.pick_data.odds}</p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-200 leading-relaxed break-words">{msg.content}</p>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-950">
        {!currentUserId ? (
          <p className="text-center text-sm text-zinc-600 py-1">
            <a href="/auth/login" className="text-green-400 hover:underline">Sign in</a> to chat
          </p>
        ) : (
          <form onSubmit={sendMessage} className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Message..."
              maxLength={1000}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500 transition-colors"
            />
            <EmojiPicker onSelect={insertAtCursor} />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="p-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black rounded-lg transition-colors"
            >
              <Send size={16} />
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
