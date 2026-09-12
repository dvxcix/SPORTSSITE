'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ReactionState = Record<string, Record<string, { count: number; selected: boolean }>>

interface Options {
  contextKey: string
  contextType: 'channel' | 'dm'
  currentUserId?: string
  channelId?: string
  partnerId?: string
  messageIds: string[]
}

export function useMessageInteractionState({
  contextKey,
  contextType,
  currentUserId,
  channelId,
  partnerId,
  messageIds,
}: Options) {
  const supabase = useMemo(() => createClient(), [])
  const [reactions, setReactions] = useState<ReactionState>({})
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [partnerLastReadAt, setPartnerLastReadAt] = useState<string | null>(null)
  const typingTimer = useRef<number | null>(null)
  const typingActive = useRef(false)
  const presenceChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const idsKey = messageIds.join(',')
  const stableMessageIds = useMemo(() => idsKey ? idsKey.split(',') : [], [idsKey])

  const loadReactions = useCallback(async () => {
    if (!stableMessageIds.length) return
    const { data } = await supabase
      .from('reactions')
      .select('target_id, emoji, user_id')
      .eq('target_type', 'message')
      .in('target_id', stableMessageIds)
    const next: ReactionState = {}
    for (const row of data ?? []) {
      const messageId = String(row.target_id)
      const emoji = String(row.emoji)
      next[messageId] ??= {}
      const current = next[messageId][emoji] ?? { count: 0, selected: false }
      next[messageId][emoji] = {
        count: current.count + 1,
        selected: current.selected || row.user_id === currentUserId,
      }
    }
    setReactions(next)
  }, [currentUserId, stableMessageIds, supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReactions(), 0)
    return () => window.clearTimeout(timer)
  }, [loadReactions])

  useEffect(() => {
    if (!currentUserId) return
    const room = supabase.channel(`presence:${contextKey}`, {
      config: { presence: { key: currentUserId } },
    })
    presenceChannel.current = room
    room.on('presence', { event: 'sync' }, () => {
      const state = room.presenceState<Record<string, unknown>>()
      const active = Object.values(state).flat().filter(item => item.user_id !== currentUserId && item.typing === true)
      setTypingUsers(active.map(item => String(item.label || 'Someone')))
    }).subscribe(status => {
      if (status === 'SUBSCRIBED') {
        void room.track({ user_id: currentUserId, label: contextType === 'dm' ? 'Someone' : 'Member', typing: false })
      }
    })
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
      typingActive.current = false
      presenceChannel.current = null
      void room.untrack()
      void supabase.removeChannel(room)
    }
  }, [contextKey, contextType, currentUserId, supabase])

  useEffect(() => {
    if (!currentUserId || contextType !== 'dm' || !partnerId) return
    void supabase.from('message_read_positions').select('last_read_at')
      .eq('context_type', 'dm').eq('user_id', partnerId).eq('partner_id', currentUserId)
      .maybeSingle().then(({ data }) => setPartnerLastReadAt(data?.last_read_at ?? null))
    const readChannel = supabase.channel(`read:${contextKey}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'message_read_positions',
        filter: `partner_id=eq.${currentUserId}`,
      }, payload => {
        const row = payload.new as { user_id?: string; last_read_at?: string }
        if (row.user_id === partnerId && row.last_read_at) setPartnerLastReadAt(row.last_read_at)
      }).subscribe()
    return () => { void supabase.removeChannel(readChannel) }
  }, [contextKey, contextType, currentUserId, partnerId, supabase])

  const notifyTyping = useCallback(() => {
    const room = presenceChannel.current
    if (!room || !currentUserId) return
    if (!typingActive.current) {
      typingActive.current = true
      void room.track({ user_id: currentUserId, label: contextType === 'dm' ? 'Someone' : 'Member', typing: true })
    }
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => {
      typingActive.current = false
      void room.track({ user_id: currentUserId, label: contextType === 'dm' ? 'Someone' : 'Member', typing: false })
    }, 1400)
  }, [contextType, currentUserId])

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!currentUserId) return
    const current = reactions[messageId]?.[emoji] ?? { count: 0, selected: false }
    setReactions(previous => ({
      ...previous,
      [messageId]: {
        ...previous[messageId],
        [emoji]: { count: Math.max(0, current.count + (current.selected ? -1 : 1)), selected: !current.selected },
      },
    }))
    const operation = current.selected
      ? supabase.from('reactions').delete().eq('user_id', currentUserId).eq('target_id', messageId).eq('target_type', 'message').eq('emoji', emoji)
      : supabase.from('reactions').insert({ user_id: currentUserId, target_id: messageId, target_type: 'message', emoji })
    const { error } = await operation
    if (error) await loadReactions()
  }, [currentUserId, loadReactions, reactions, supabase])

  const markRead = useCallback(async (messageId?: string) => {
    if (!currentUserId || !messageId) return
    const identity = contextType === 'channel'
      ? { context_type: 'channel', user_id: currentUserId, channel_id: channelId, partner_id: null }
      : { context_type: 'dm', user_id: currentUserId, channel_id: null, partner_id: partnerId }
    if ((contextType === 'channel' && !channelId) || (contextType === 'dm' && !partnerId)) return
    const match = contextType === 'channel'
      ? { user_id: currentUserId, context_type: 'channel', channel_id: channelId }
      : { user_id: currentUserId, context_type: 'dm', partner_id: partnerId }
    const values = { last_read_message_id: messageId, last_read_at: new Date().toISOString() }
    const { data } = await supabase.from('message_read_positions').update(values).match(match).select('user_id').maybeSingle()
    if (!data) await supabase.from('message_read_positions').insert({ ...identity, ...values })
  }, [channelId, contextType, currentUserId, partnerId, supabase])

  return { reactions, typingUsers, partnerLastReadAt, notifyTyping, toggleReaction, markRead }
}
