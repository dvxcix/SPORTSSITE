'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

// Shared modal shell — every modal in this app (GroupInviteModal, PostBetModal,
// HrPopup, ReportModal, ShareImageModal, ...) hand-rolled the same
// `fixed inset-0 bg-black/60 ... z-50` backdrop + centered panel + click-
// outside-to-close shape independently. This is that shape, extracted once,
// for anything new (starting with ChangelogPopup) instead of a fresh copy.
export function Modal({ onClose, children, maxWidth = 420, zIndex, label = 'Dialog', showClose = false }: {
  onClose: () => void
  children: React.ReactNode
  maxWidth?: number
  zIndex?: number
  label?: string
  showClose?: boolean
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm" style={{ zIndex: zIndex ?? 'var(--layer-modal)' }} />
        <Dialog.Content
          aria-label={label}
          className="fixed left-1/2 top-1/2 max-h-[min(85vh,760px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius)] border border-[var(--border-2)] bg-[var(--surface)] shadow-[var(--shadow-overlay)] focus:outline-none"
          style={{ maxWidth, zIndex: zIndex ?? 'var(--layer-modal)' }}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {showClose ? (
            <Dialog.Close aria-label="Close" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg border border-transparent text-[var(--text-3)] transition-colors hover:border-[var(--border-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          ) : null}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
