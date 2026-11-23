'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useId, useState } from 'react'
import { X } from 'lucide-react'
import styles from './creatorWorkspace.module.css'

/** One portaled, keyboard-contained surface for creator editing and checkout. */
export function CreatorDialog({ title, description, onClose, children, busy = false, narrow = false }: { title: string; description?: string; onClose: () => void; children: React.ReactNode; busy?: boolean; narrow?: boolean }) {
  const [returnFocus] = useState(() => typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null)
  const descriptionId = useId()
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose() }}><Dialog.Portal><Dialog.Overlay className={styles.dialogOverlay}/><div className={styles.dialogRail}><Dialog.Content className={styles.dialog} data-narrow={narrow || undefined} aria-describedby={description ? descriptionId : undefined} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => { if (busy) event.preventDefault() }} onCloseAutoFocus={event => { event.preventDefault(); returnFocus?.focus() }}><header className={styles.dialogHeader}><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description id={descriptionId}>{description}</Dialog.Description>}</div><Dialog.Close disabled={busy} aria-label={'Close ' + title}><X size={19}/></Dialog.Close></header><div className={styles.dialogBody}>{children}</div></Dialog.Content></div></Dialog.Portal></Dialog.Root>
}
