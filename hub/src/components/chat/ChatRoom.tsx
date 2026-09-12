'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Image as ImageIcon, Pencil, Reply, Send, Trash2, TrendingUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/supabase/types'
import { EmojiPicker } from '@/components/social/EmojiPicker'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { sendDesktopNotification } from '@/lib/desktopNotifications'
import { MentionInput } from '@/components/social/MentionInput'
import { LinkifiedText } from '@/components/social/LinkifiedText'
import { notifyMentions } from '@/lib/mentions'
import { uploadMedia } from '@/lib/uploadMedia'
import { SafeImage } from '@/components/ui/SafeImage'
import { GifPicker } from '@/components/social/GifPicker'
import { MessageReactionBar } from '@/components/chat/MessageReactionBar'
import { useMessageInteractionState } from '@/components/chat/useMessageInteractionState'

interface ChatRoomProps {
  channelId: string
  channelSlug: string
  channelName: string
  initialMessages: Message[]
  currentUserId?: string
  canModerate?: boolean
}

export function ChatRoom({ channelId, channelSlug, channelName, initialMessages, currentUserId, canModerate = false }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
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
    const realtimeChannel = supabase
      .channel(`chat:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}`,
      }, async (payload) => {
        const newMessage = payload.new as Message
        const { data: sender } = await supabase
          .from('users')
          .select('id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified,account_type')
          .eq('id', newMessage.sender_id)
          .single()
        const hydrated = { ...newMessage, sender: sender as Message['sender'] ?? undefined }
        setMessages(previous => previous.some(message => message.id === hydrated.id) ? previous : [...previous, hydrated])
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
      .subscribe()
    return () => { void supabase.removeChannel(realtimeChannel) }
  }, [channelId, channelName, currentUserId, supabase])

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [atBottom, messages])

  useEffect(() => {
    if (atBottom) void markRead(messages.at(-1)?.id)
  }, [atBottom, markRead, messages])

  useEffect(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    atBottomRef.current = true
    setAtBottom(true)
    setUnseenCount(0)
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    if ((!input.trim() && !imageUrl) || !currentUserId || sending || uploadingImage) return
    const content = input.trim()
    setSendError('')
    setSending(true)
    if (editingMessage) {
      const previousContent = editingMessage.content
      const editedAt = new Date().toISOString()
      setMessages(previous => previous.map(message => message.id === editingMessage.id ? { ...message, content, edited_at: editedAt } : message))
      const { error } = await supabase.from('messages').update({ content, edited_at: editedAt }).eq('id', editingMessage.id).eq('sender_id', currentUserId)
      if (error) {
        setMessages(previous => previous.map(message => message.id === editingMessage.id ? { ...message, content: previousContent, edited_at: editingMessage.edited_at } : message))
        setSendError('Edit not saved. Try again.')
      } else {
        setInput('')
        setEditingMessage(null)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
      setSending(false)
      return
    }
    const { data, error } = await supabase.from('messages').insert({
      channel_id: channelId, sender_id: currentUserId, content,
      reply_to_id: replyingTo?.id ?? null,
      media_urls: imageUrl ? [imageUrl] : [],
      message_type: imageUrl ? 'media' : 'text',
    }).select('id').single()
    if (!error && data) {
      setInput('')
      setImageUrl('')
      setReplyingTo(null)
      await notifyMentions(supabase, currentUserId, content, `/channels/${channelSlug}`, data.id, 'a channel message')
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setSendError('Message not sent. Try again.')
    }
    setSending(false)
  }

  function beginEdit(message: Message) {
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
    const previous = messages
    setMessages(current => current.map(item => item.id === message.id ? { ...item, content: '', media_urls: [], is_deleted: true } : item))
    const { error } = message.sender_id === currentUserId
      ? await supabase.from('messages').update({ content: '', media_urls: [], is_deleted: true, edited_at: new Date().toISOString() }).eq('id', message.id).eq('sender_id', currentUserId)
      : await supabase.rpc('moderate_channel_message', { p_message_id: message.id })
    if (error) {
      setMessages(previous)
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
            {replyTarget && <button type="button" className="ss-chat-reply-context" onClick={() => document.getElementById(`message-${replyTarget.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Reply size={11}/><span>{replyTarget.sender?.display_name || replyTarget.sender?.username || 'Member'}</span><p>{replyTarget.content}</p></button>}
            {message.is_deleted ? <p className="ss-chat-deleted">Message deleted</p> : message.pick_data ? <div className="ss-chat-pick"><div><TrendingUp size={10}/> PICK</div><strong>{message.pick_data.team}</strong><span>{message.pick_data.line} · {message.pick_data.odds}</span></div> : <p><LinkifiedText text={message.content || ''} />{message.edited_at ? <small className="ss-chat-edited">edited</small> : null}</p>}
            {!message.is_deleted && message.media_urls?.[0] && <SafeImage src={message.media_urls[0]} alt="" className="ss-chat-media"/>}
            <MessageReactionBar reactions={reactions[message.id]} disabled={!currentUserId || message.is_deleted} onToggle={emoji => void toggleReaction(message.id, emoji)}/>
            {!message.is_deleted ? <div className="ss-chat-message-actions">
              <button type="button" className="ss-chat-inline-action" onClick={() => { setEditingMessage(null); setReplyingTo(message); inputRef.current?.focus() }} aria-label={`Reply to ${name}`}><Reply size={12}/> Reply</button>
              {message.sender_id === currentUserId ? <button type="button" className="ss-chat-inline-action" onClick={() => beginEdit(message)} aria-label="Edit message"><Pencil size={11}/> Edit</button> : null}
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
      {editingMessage ? <div className="ss-chat-replying is-editing"><Pencil size={12}/><div><span>Editing message</span><p>Save changes with Enter</p></div><button type="button" onClick={() => { setEditingMessage(null); setInput('') }} aria-label="Cancel edit"><X size={14}/></button></div> : replyingTo ? <div className="ss-chat-replying"><Reply size={12}/><div><span>Replying to {replyingTo.sender?.display_name || replyingTo.sender?.username || 'member'}</span><p>{replyingTo.content}</p></div><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><X size={14}/></button></div> : null}
      {imageUrl && <div className="ss-chat-media-preview"><SafeImage src={imageUrl} alt="Upload preview"/><button type="button" onClick={() => setImageUrl('')} aria-label="Remove image"><X size={13}/></button></div>}
      {!currentUserId ? <p className="ss-chat-signin"><Link href="/auth/login">Sign in</Link> to join the conversation</p> : <form onSubmit={sendMessage} className="ss-chat-composer">
        <MentionInput ref={inputRef} value={input} onValueChange={value => { setInput(value); notifyTyping(); if (sendError) setSendError('') }} currentUserId={currentUserId} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
        }} placeholder={editingMessage ? 'Edit message' : `Message #${channelName}`} maxLength={1000} rows={1}/>
        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = '' }}/>
        <button type="button" className="ss-chat-attach" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} aria-label="Attach image"><ImageIcon size={16}/></button>
        <EmojiPicker onSelect={insertAtCursor}/>
        <GifPicker uploadKind="messages" onSelect={setImageUrl}/>
        <button type="submit" disabled={(!input.trim() && !imageUrl) || sending || uploadingImage} aria-label="Send message"><Send size={16}/></button>
      </form>}
      {sendError && <button type="button" className="ss-chat-send-error" onClick={() => inputRef.current?.form?.requestSubmit()}>{sendError}</button>}
    </div>
  </div>
}
