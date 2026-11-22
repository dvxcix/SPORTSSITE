'use client'

import { scrollMessagePane } from '@/lib/messageScroll'
import { CHANNEL_MESSAGE_COLUMNS, loadChannelHistory } from '@/lib/channelHistory'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Image as ImageIcon, Pencil, Reply, Send, Trash2, TrendingUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/supabase/types'
import { EmojiPicker } from '@/components/social/EmojiPicker'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { sendDesktopNotification } from '@/lib/desktopNotifications'
import { MentionInput } from '@/components/social/MentionInput'
import { LinkifiedText } from '@/components/social/LinkifiedText'
import { EmojiText } from '@/components/social/EmojiText'
import { notifyMentions } from '@/lib/mentions'
import { uploadMedia } from '@/lib/uploadMedia'
import { SafeImage } from '@/components/ui/SafeImage'
import { GifPicker } from '@/components/social/GifPicker'
import { MessageReactionBar } from '@/components/chat/MessageReactionBar'
import { useMessageInteractionState } from '@/components/chat/useMessageInteractionState'
import { useMessageDraft } from '@/components/chat/useMessageDraft'
import { useMessageRecovery } from '@/components/chat/useMessageRecovery'
import { UnsentDrafts } from '@/components/chat/UnsentDrafts'

interface ChatRoomProps {
  channelId: string
  channelSlug: string
  channelName: string
  initialMessages: Message[]
  currentUserId?: string
  canModerate?: boolean
  readOnly?: boolean
  contextHref?: string
}

export function ChatRoom({ channelId, channelSlug, channelName, initialMessages, currentUserId, canModerate = false, readOnly = false, contextHref }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const { text: input, setText: setInput, snapshot, clearSubmitted, retainFailed, unsent, insertUnsent } = useMessageDraft()
  const sendLock = useRef(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [unseenCount, setUnseenCount] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const atBottomRef = useRef(true)
  const supabase = useMemo(() => createClient(), [])
  const load = useCallback((signal: AbortSignal) => loadChannelHistory(supabase, channelId, 80, signal), [supabase, channelId])
  const { connectionError, recover, setConnectionError } = useMessageRecovery({ messages, setMessages, load, scope: channelId })
  const messageIds = useMemo(() => messages.map(message => message.id), [messages])
  const { reactions, typingUsers, notifyTyping, toggleReaction, markRead } = useMessageInteractionState({
    contextKey: `channel:${channelId}`,
    contextType: 'channel',
    currentUserId,
    channelId,
    messageIds,
  })

  function insertAtCursor(insertion: string) {
    const element = inputRef.current
    const start = element?.selectionStart ?? input.length
    const end = element?.selectionEnd ?? input.length
    setInput(input.slice(0, start) + insertion + input.slice(end))
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + insertion.length, start + insertion.length)
    })
  }

  useEffect(() => {
    let active = true
    const realtimeChannel = supabase
      .channel(`chat:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}`,
      }, async (payload) => {
        const newMessage = payload.new as Message
        if (!active) return
        setMessages(previous => previous.some(message => message.id === newMessage.id) ? previous : [...previous, newMessage].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)))
        const { data: sender } = await supabase
          .from('users')
          .select('id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified,account_type')
          .eq('id', newMessage.sender_id)
          .single()
        if (!active) return
        setMessages(previous => previous.map(message => message.id === newMessage.id ? { ...message, sender: sender as Message['sender'] ?? message.sender } : message))
        if (!atBottomRef.current && newMessage.sender_id !== currentUserId) setUnseenCount(count => count + 1)
        if (newMessage.sender_id !== currentUserId && document.visibilityState !== 'visible') {
          const senderName = sender?.display_name || sender?.username || 'Someone'
          void sendDesktopNotification(`# ${channelName} · ${senderName}`, newMessage.content || 'Shared a pick')
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}`,
      }, payload => {
        const updated = payload.new as Message
        setMessages(previous => previous.map(message => message.id === updated.id ? { ...message, ...updated } : message))
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}`,
      }, payload => {
        const removed = payload.old as Pick<Message, 'id'>
        setMessages(previous => previous.filter(message => message.id !== removed.id))
      })
      .subscribe(status => {
        if (active && status === 'SUBSCRIBED') void recover()
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) setConnectionError(true)
      })
    return () => { active = false; void supabase.removeChannel(realtimeChannel) }
  }, [channelId, channelName, currentUserId, supabase, recover, setConnectionError])

  useEffect(() => {
    if (atBottom) scrollMessagePane(scrollRef.current, undefined, 'smooth')
  }, [atBottom, messages])

  useEffect(() => {
    if (atBottom) void markRead(messages.at(-1)?.id)
  }, [atBottom, markRead, messages])

  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollMessagePane(scrollRef.current))
    return () => cancelAnimationFrame(frame)
  }, [])

  function handleScroll() {
    const viewport = scrollRef.current
    if (!viewport) return
    const nextAtBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80
    atBottomRef.current = nextAtBottom
    setAtBottom(nextAtBottom)
    if (nextAtBottom) setUnseenCount(0)
  }

  function jumpToLatest() {
    scrollMessagePane(scrollRef.current, undefined, 'smooth')
    atBottomRef.current = true
    setAtBottom(true)
    setUnseenCount(0)
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    if (readOnly || (!input.trim() && !imageUrl) || !currentUserId || sendLock.current || uploadingImage) return
    sendLock.current = true
    const submitted = snapshot()
    const draft = input
    const content = input.trim()
    setSendError('')
    setSending(true)
    let rollbackEdit = () => {}
    try {
    if (editingMessage) {
      const editedAt = new Date().toISOString()
      const original = messages.find(message => message.id === editingMessage.id) ?? editingMessage
      const optimistic = { ...original, content, edited_at: editedAt }
      setMessages(previous => previous.map(message => message.id === editingMessage.id ? optimistic : message))
      rollbackEdit = () => setMessages(previous => previous.map(message => message === optimistic ? original : message))
      const { error } = await supabase.from('messages').update({ content, edited_at: editedAt }).eq('id', editingMessage.id).eq('sender_id', currentUserId)
      if (error) {
        rollbackEdit()
        setSendError('Edit not saved. Try again.')
      } else {
        if (clearSubmitted(submitted)) setEditingMessage(null)
        else setEditingMessage({ ...editingMessage, content, edited_at: editedAt })
        requestAnimationFrame(() => inputRef.current?.focus())
      }
      return
    }
    const { data, error } = await supabase.from('messages').insert({
      channel_id: channelId, sender_id: currentUserId, content,
      reply_to_id: replyingTo?.id ?? null,
      media_urls: imageUrl ? [imageUrl] : [],
      message_type: imageUrl ? 'media' : 'text',
    }).select(CHANNEL_MESSAGE_COLUMNS).single()
    if (!error && data) {
      const sent = data as unknown as Message
      setMessages(previous => previous.some(message => message.id === sent.id) ? previous : [...previous, sent])
      clearSubmitted(submitted)
      setImageUrl('')
      setReplyingTo(null)
      void notifyMentions(supabase, currentUserId, content, contextHref||`/channels/${channelSlug}`, sent.id, 'a channel message').catch(() => {})
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      retainFailed(submitted, draft)
      setSendError('Message not sent. Try again.')
    }
    } catch {
      if (!editingMessage) retainFailed(submitted, draft)
      rollbackEdit()
      setSendError(editingMessage ? 'Edit not saved. Try again.' : 'Message not sent. Try again.')
    }
    finally { sendLock.current = false; setSending(false) }
  }

  function beginEdit(message: Message) {
    if (sendLock.current) return
    setReplyingTo(null)
    setImageUrl('')
    setEditingMessage(message)
    setInput(message.content || '')
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(message.content?.length ?? 0, message.content?.length ?? 0)
    })
  }

  async function deleteMessage(message: Message) {
    if (!currentUserId || (message.sender_id !== currentUserId && !canModerate)) return
    const original = messages.find(item => item.id === message.id) ?? message
    const optimistic = { ...original, content: '', media_urls: [], is_deleted: true }
    setMessages(current => current.map(item => item.id === message.id ? optimistic : item))
    try {
      const { error } = message.sender_id === currentUserId
        ? await supabase.from('messages').update({ content: '', media_urls: [], is_deleted: true, edited_at: new Date().toISOString() }).eq('id', message.id).eq('sender_id', currentUserId)
        : await supabase.rpc('moderate_channel_message', { p_message_id: message.id })
      if (error) throw error
    } catch {
      setMessages(current => current.map(item => item === optimistic ? original : item))
      setSendError('Message not deleted. Try again.')
    }
  }

  async function uploadImage(file: File) {
    if (!currentUserId) return
    setUploadingImage(true)
    setSendError('')
    try {
      const result = await uploadMedia(file, 'messages')
      if ('error' in result) setSendError(result.error)
      else setImageUrl(result.publicUrl)
    } catch {
      setSendError('Image upload failed. Try again.')
    } finally {
      setUploadingImage(false)
    }
  }

  return <div className="ss-chat-room">
    {connectionError && <p role="status" className="ss-chat-connection-status">Connection interrupted. <button type="button" onClick={() => void recover()}>Reconnect</button></p>}
    <div ref={scrollRef} onScroll={handleScroll} className="ss-chat-messages">
      {!messages.length && <div className="ss-chat-empty"><span>#</span><strong>{channelName}</strong><p>Start the conversation.</p></div>}
      {messages.map((message, index) => {
        const previous = messages[index - 1]
        const startsGroup = !previous || previous.sender_id !== message.sender_id || new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() > 300000
        const name = message.sender?.display_name || message.sender?.username || 'Member'
        const stamp = new Date(message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        const replyTarget = message.reply_to ?? messages.find(item => item.id === message.reply_to_id)
        return <article id={`message-${message.id}`} key={message.id} className={`ss-chat-message ${startsGroup ? 'starts-group' : ''} ${message.sender_id === currentUserId ? 'is-own' : ''}`}>
          {startsGroup ? (
            message.sender?.username
              ? <Link href={`/profile/${message.sender.username}`} className="ss-chat-avatar"><MemberAvatar src={message.sender.avatar_url} name={name} size={38} ringStyle={message.sender.avatar_ring_style} ringColor={message.sender.avatar_ring_color} /></Link>
              : <MemberAvatar src={message.sender?.avatar_url} name={name} size={38} ringStyle={message.sender?.avatar_ring_style} ringColor={message.sender?.avatar_ring_color} />
          ) : <time>{stamp}</time>}
          <div className="ss-chat-message-body">
            {startsGroup && <header>{message.sender?.username ? <Link href={`/profile/${message.sender.username}`}>{name}</Link> : <strong>{name}</strong>}{message.sender?.is_verified && <span className="ss-chat-verified">✓</span>}<time>{stamp}</time></header>}
            {replyTarget && <button type="button" className="ss-chat-reply-context" onClick={() => scrollMessagePane(scrollRef.current, document.getElementById(`message-${replyTarget.id}`), 'smooth')}><Reply size={11}/><span>{replyTarget.sender?.display_name || replyTarget.sender?.username || 'Member'}</span><p><EmojiText text={replyTarget.content || ''} /></p></button>}
            {message.is_deleted ? <p className="ss-chat-deleted">Message deleted</p> : message.pick_data ? <div className="ss-chat-pick"><div><TrendingUp size={10}/> PICK</div><strong>{message.pick_data.team}</strong><span>{message.pick_data.line} · {message.pick_data.odds}</span></div> : <p><LinkifiedText text={message.content || ''} />{message.edited_at ? <small className="ss-chat-edited">edited</small> : null}</p>}
            {!message.is_deleted && message.media_urls?.[0] && <SafeImage src={message.media_urls[0]} alt="" className="ss-chat-media"/>}
            <MessageReactionBar reactions={reactions[message.id]} disabled={!currentUserId || message.is_deleted} onToggle={emoji => void toggleReaction(message.id, emoji)}/>
            {!message.is_deleted ? <div className="ss-chat-message-actions">
              {!readOnly ? <button type="button" className="ss-chat-inline-action" onClick={() => { setEditingMessage(null); setReplyingTo(message); inputRef.current?.focus() }} aria-label={`Reply to ${name}`}><Reply size={12}/> Reply</button> : null}
              {!readOnly && message.sender_id === currentUserId ? <button type="button" className="ss-chat-inline-action" onClick={() => beginEdit(message)} disabled={sending} aria-label="Edit message"><Pencil size={11}/> Edit</button> : null}
              {(message.sender_id === currentUserId || canModerate) ? <button type="button" className="ss-chat-inline-action is-danger" onClick={() => void deleteMessage(message)} aria-label={message.sender_id === currentUserId ? 'Delete message' : 'Remove message'}><Trash2 size={11}/> {message.sender_id === currentUserId ? 'Delete' : 'Remove'}</button> : null}
            </div> : null}
          </div>
        </article>
      })}
      <div ref={bottomRef}/>
    </div>
    {typingUsers.length > 0 && <div className="ss-chat-typing" role="status"><i/><i/><i/><span>{typingUsers.length > 1 ? `${typingUsers.length} members are typing` : 'Someone is typing'}</span></div>}
    {!atBottom && <button type="button" className="ss-chat-new" onClick={jumpToLatest}><ArrowDown size={14}/>{unseenCount ? `${unseenCount} new` : 'Latest'}</button>}
    <div className="ss-chat-composer-wrap">
      {editingMessage ? <div className="ss-chat-replying is-editing"><Pencil size={12}/><div><span>Editing message</span><p>Save changes with Enter</p></div><button type="button" onClick={() => { setEditingMessage(null); setInput('') }} disabled={sending} aria-label="Cancel edit"><X size={14}/></button></div> : replyingTo ? <div className="ss-chat-replying"><Reply size={12}/><div><span>Replying to {replyingTo.sender?.display_name || replyingTo.sender?.username || 'member'}</span><p><EmojiText text={replyingTo.content || ''} /></p></div><button type="button" onClick={() => setReplyingTo(null)} disabled={sending} aria-label="Cancel reply"><X size={14}/></button></div> : null}
      {imageUrl && <div className="ss-chat-media-preview"><SafeImage src={imageUrl} alt="Upload preview"/><button type="button" onClick={() => setImageUrl('')} disabled={sending} aria-label="Remove image"><X size={13}/></button></div>}
      <UnsentDrafts drafts={unsent} disabled={input.length >= 999} onInsert={insertUnsent}/>
      {readOnly ? <p className="ss-chat-signin">Only community staff can post in this channel.</p> : !currentUserId ? <p className="ss-chat-signin"><Link href="/auth/login">Sign in</Link> to join the conversation</p> : <form onSubmit={sendMessage} className="ss-chat-composer">
        <MentionInput ref={inputRef} value={input} onValueChange={value => { setInput(value); notifyTyping(); if (sendError) setSendError('') }} currentUserId={currentUserId} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
        }} aria-label={editingMessage ? 'Edit message' : `Message #${channelName}`} placeholder={editingMessage ? 'Edit message' : `Message #${channelName}`} maxLength={1000} rows={1}/>
        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = '' }}/>
        <button type="button" className="ss-chat-attach" onClick={() => imageInputRef.current?.click()} disabled={sending || uploadingImage} aria-label="Attach image"><ImageIcon size={16}/></button>
        <EmojiPicker onSelect={insertAtCursor}/>
        <GifPicker uploadKind="messages" disabled={sending || uploadingImage} onSelect={url => { if (!sendLock.current) setImageUrl(url) }}/>
        <button type="submit" disabled={(!input.trim() && !imageUrl) || sending || uploadingImage} aria-label="Send message"><Send size={16}/></button>
      </form>}
      {sendError && <p role="alert" className="ss-chat-send-error">{sendError}</p>}
    </div>
  </div>
}
