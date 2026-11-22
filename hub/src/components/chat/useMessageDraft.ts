'use client'

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/** A successful send may clear its own draft, never text entered afterwards. */
export function useMessageDraft() {
  const [text, setValue] = useState('')
  const [unsent, setUnsent] = useState<string[]>([])
  const revision = useRef(0)
  const setText: Dispatch<SetStateAction<string>> = useCallback(value => {
    revision.current += 1
    setValue(value)
  }, [])
  const snapshot = useCallback(() => revision.current, [])
  const clearSubmitted = useCallback((submitted: number) => {
    if (revision.current !== submitted) return false
    revision.current += 1
    setValue('')
    return true
  }, [])
  const retainFailed = useCallback((submitted: number, content: string) => {
    if (revision.current !== submitted && content) setUnsent(previous => [...previous, content])
  }, [])
  const insertUnsent = useCallback((index: number) => {
    const content = unsent[index]
    if (!content) return
    const space = 1000 - text.length - (text ? 1 : 0)
    if (space <= 0) return
    const insertion = content.slice(0, space)
    setText(text ? `${text}\n${insertion}` : insertion)
    setUnsent(previous => previous.flatMap((draft, at) => at !== index ? [draft] : content.length > space ? [content.slice(space)] : []))
  }, [setText, text, unsent])
  return { text, setText, snapshot, clearSubmitted, retainFailed, unsent, insertUnsent }
}
