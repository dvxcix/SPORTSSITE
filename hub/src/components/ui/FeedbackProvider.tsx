'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import styles from './FeedbackProvider.module.css'

type FeedbackTone = 'default' | 'success' | 'warning' | 'error'

type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: FeedbackTone
}

type NoticeOptions = {
  title?: string
  message: string
  tone?: FeedbackTone
  duration?: number
}

type PromptOptions = {
  title?: string
  message?: string
  label?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
  type?: 'text' | 'datetime-local'
  multiline?: boolean
}

type ConfirmRequest = ConfirmOptions & {
  id: number
  resolve: (confirmed: boolean) => void
}

type Notice = NoticeOptions & { id: number }

type PromptRequest = PromptOptions & {
  id: number
  resolve: (value: string | null) => void
}

type FeedbackContextValue = {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>
  prompt: (options: PromptOptions | string) => Promise<string | null>
  notify: (options: NoticeOptions | string) => void
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

const toneIcon = {
  default: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const idRef = useRef(0)
  const [confirmQueue, setConfirmQueue] = useState<ConfirmRequest[]>([])
  const [promptQueue, setPromptQueue] = useState<PromptRequest[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const currentConfirm = confirmQueue[0]
  const currentPrompt = currentConfirm ? undefined : promptQueue[0]

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const normalized = typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>((resolve) => {
      setConfirmQueue((queue) => [...queue, { ...normalized, id: ++idRef.current, resolve }])
    })
  }, [])

  const prompt = useCallback((options: PromptOptions | string) => {
    const normalized = typeof options === 'string' ? { title: options } : options
    return new Promise<string | null>((resolve) => {
      setPromptQueue((queue) => [...queue, { ...normalized, id: ++idRef.current, resolve }])
    })
  }, [])

  const notify = useCallback((options: NoticeOptions | string) => {
    const normalized = typeof options === 'string' ? { message: options } : options
    const notice = { ...normalized, id: ++idRef.current }
    setNotices((items) => [...items.slice(-3), notice])
  }, [])

  const closeConfirm = useCallback((confirmed: boolean) => {
    setConfirmQueue((queue) => {
      const [active, ...rest] = queue
      active?.resolve(confirmed)
      return rest
    })
  }, [])

  const closePrompt = useCallback((value: string | null) => {
    setPromptQueue((queue) => {
      const [active, ...rest] = queue
      active?.resolve(value)
      return rest
    })
  }, [])

  const dismissNotice = useCallback((id: number) => {
    setNotices((items) => items.filter((notice) => notice.id !== id))
  }, [])

  return (
    <FeedbackContext.Provider value={{ confirm, prompt, notify }}>
      {children}
      {currentConfirm ? (
        <Dialog.Root open onOpenChange={(open) => { if (!open) closeConfirm(false) }}>
          <Dialog.Portal>
            <Dialog.Overlay className={styles.overlay} />
            <Dialog.Content className={styles.dialog} aria-describedby={`feedback-message-${currentConfirm.id}`}>
              <div className={`${styles.iconWrap} ${styles[currentConfirm.tone ?? 'default']}`}>
                {(() => {
                  const Icon = toneIcon[currentConfirm.tone ?? 'default']
                  return <Icon size={20} aria-hidden="true" />
                })()}
              </div>
              <div className={styles.dialogCopy}>
                <Dialog.Title className={styles.title}>{currentConfirm.title ?? 'Please confirm'}</Dialog.Title>
                <Dialog.Description id={`feedback-message-${currentConfirm.id}`} className={styles.message}>
                  {currentConfirm.message}
                </Dialog.Description>
              </div>
              <div className={styles.actions}>
                <button type="button" className="ss-btn" onClick={() => closeConfirm(false)}>
                  {currentConfirm.cancelLabel ?? 'Cancel'}
                </button>
                <button
                  type="button"
                  className={currentConfirm.tone === 'error' ? styles.dangerButton : 'ss-btn ss-btn-accent'}
                  onClick={() => closeConfirm(true)}
                >
                  {currentConfirm.confirmLabel ?? 'Confirm'}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
      {currentPrompt ? <FeedbackPrompt key={currentPrompt.id} request={currentPrompt} close={closePrompt} /> : null}
      <div className={styles.toastRegion} aria-live="polite" aria-label="Notifications">
        {notices.map((notice) => (
          <FeedbackToast key={notice.id} notice={notice} dismiss={dismissNotice} />
        ))}
      </div>
    </FeedbackContext.Provider>
  )
}

function FeedbackPrompt({ request, close }: { request: PromptRequest; close: (value: string | null) => void }) {
  const [value, setValue] = useState(request.defaultValue ?? '')

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) close(null) }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} aria-describedby={request.message ? `feedback-prompt-message-${request.id}` : undefined}>
          <div className={`${styles.iconWrap} ${styles.default}`}>
            <Info size={20} aria-hidden="true" />
          </div>
          <div className={styles.dialogCopy}>
            <Dialog.Title className={styles.title}>{request.title ?? 'Add details'}</Dialog.Title>
            {request.message ? (
              <Dialog.Description id={`feedback-prompt-message-${request.id}`} className={styles.message}>
                {request.message}
              </Dialog.Description>
            ) : null}
          </div>
          <form className={styles.promptForm} onSubmit={(event) => { event.preventDefault(); close(value) }}>
            <label htmlFor={`feedback-prompt-${request.id}`}>{request.label ?? 'Details'}</label>
            {request.multiline ? (
              <textarea id={`feedback-prompt-${request.id}`} value={value} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} autoFocus rows={4} />
            ) : (
              <input id={`feedback-prompt-${request.id}`} type={request.type ?? 'text'} value={value} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} autoFocus />
            )}
            <div className={styles.actions}>
              <button type="button" className="ss-btn" onClick={() => close(null)}>{request.cancelLabel ?? 'Cancel'}</button>
              <button type="submit" className="ss-btn ss-btn-accent">{request.confirmLabel ?? 'Continue'}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function FeedbackToast({ notice, dismiss }: { notice: Notice; dismiss: (id: number) => void }) {
  const tone = notice.tone ?? 'default'
  const Icon = toneIcon[tone]

  useEffect(() => {
    const timeout = window.setTimeout(() => dismiss(notice.id), notice.duration ?? 4200)
    return () => window.clearTimeout(timeout)
  }, [dismiss, notice.duration, notice.id])

  return (
    <div className={`${styles.toast} ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div className={styles.toastCopy}>
        {notice.title ? <strong>{notice.title}</strong> : null}
        <span>{notice.message}</span>
      </div>
      <button type="button" onClick={() => dismiss(notice.id)} aria-label="Dismiss notification" className={styles.dismiss}>
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  )
}

export function useFeedback() {
  const context = useContext(FeedbackContext)
  if (!context) throw new Error('useFeedback must be used within FeedbackProvider')
  return context
}
