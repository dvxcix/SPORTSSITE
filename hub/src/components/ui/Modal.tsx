'use client'

// Shared modal shell — every modal in this app (GroupInviteModal, PostBetModal,
// HrPopup, ReportModal, ShareImageModal, ...) hand-rolled the same
// `fixed inset-0 bg-black/60 ... z-50` backdrop + centered panel + click-
// outside-to-close shape independently. This is that shape, extracted once,
// for anything new (starting with ChangelogPopup) instead of a fresh copy.
export function Modal({ onClose, children, maxWidth = 420, zIndex = 100 }: {
  onClose: () => void
  children: React.ReactNode
  maxWidth?: number
  zIndex?: number
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: maxWidth, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
