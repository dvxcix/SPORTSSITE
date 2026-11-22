'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { reconcileMessageHistory } from '@/lib/conversationHistory'

export function useMessageRecovery<T extends { id: string; created_at: string }>({ messages, setMessages, load, scope }: {
  messages: T[]; setMessages: Dispatch<SetStateAction<T[]>>; load: (signal: AbortSignal) => Promise<T[]>; scope: string
}) {
  const current = useRef(messages)
  const run = useRef<() => Promise<void>>(async () => {})
  const [connectionError, setConnectionError] = useState(false)
  useEffect(() => { current.current = messages }, [messages])
  useEffect(() => {
    let active = true, pending = false, queued = false
    const controller = new AbortController()
    async function recover() {
      if (!active || document.visibilityState === 'hidden' || navigator.onLine === false) return
      if (pending) { queued = true; return }
      pending = true
      const before = current.current
      try {
        const recent = await load(AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]))
        if (active) {
          setMessages(latest => reconcileMessageHistory(before, latest, recent))
          setConnectionError(false)
        }
      } catch { if (active) setConnectionError(true) }
      finally {
        pending = false
        if (active && queued) { queued = false; void recover() }
      }
    }
    run.current = recover
    const resume = () => { void recover() }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    window.addEventListener('pageshow', resume)
    void recover()
    return () => {
      active = false; controller.abort(); run.current = async () => {}
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('pageshow', resume)
    }
  }, [load, scope, setMessages])
  const recover = useCallback(() => run.current(), [])
  return { connectionError, recover, setConnectionError }
}
