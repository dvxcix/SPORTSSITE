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
        <Dialog.Overlay className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out" style={{ zIndex: zIndex ?? 'var(--layer-modal)' }} />
        <div data-modal-viewport className="pointer-events-none fixed inset-0 flex items-center justify-center p-3" style={{ zIndex: zIndex ?? 'var(--layer-modal)' }}>
        <Dialog.Content
          aria-label={label}
          className="pointer-events-auto relative max-h-[min(88dvh,780px)] w-full overflow-y-auto rounded-[22px] border border-[var(--border-2)] bg-[var(--surface)] shadow-[var(--shadow-overlay)] backdrop-blur-3xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
          style={{ maxWidth, zIndex: zIndex ?? 'var(--layer-modal)', background: 'var(--surface)', borderRadius: 16, color: 'var(--text-1)' }}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {showClose ? (
            <Dialog.Close aria-label="Close" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-[var(--hairline)] bg-[rgba(var(--contrast-rgb),0.025)] text-[var(--text-3)] shadow-[inset_0_1px_rgba(255,255,255,0.04)] transition hover:border-[var(--border-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          ) : null}
          {children}
        </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
