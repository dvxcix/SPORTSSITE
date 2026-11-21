'use client'

import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { Check, Search, X } from 'lucide-react'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { AVATAR_DECORATIONS, RING_STYLES, avatarStyleName, isAvatarStyle, type MemberRingStyle } from '@/lib/avatarStyles'

const categories = ['All', 'Rings', 'Football', 'Basketball', 'Baseball', 'SlipSurge'] as const
const options = [
  ...RING_STYLES.map(value => ({ value: value as MemberRingStyle, name: avatarStyleName(value), category: 'Rings' })),
  ...AVATAR_DECORATIONS.map(item => ({ value: `deco:${item.id}` as MemberRingStyle, name: item.name, category: item.sport === 'slipsurge' ? 'SlipSurge' : item.sport[0].toUpperCase() + item.sport.slice(1) })),
]
type Props = { value: MemberRingStyle; onChange: (value: MemberRingStyle) => void; src?: string | null; name: string; color?: string }

export function AvatarStylePicker(props: Props) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="ss-avatar-style-change" onClick={() => setOpen(true)}>Change style</button>
    {open && <StyleDialog {...props} onClose={() => setOpen(false)} />}
  </>
}

function StyleDialog({ value, onChange, onClose, src, name, color }: Props & { onClose: () => void }) {
  const titleId = useId()
  const descriptionId = useId()
  const [draft, setDraft] = useState<MemberRingStyle>(isAvatarStyle(value) ? value : 'surge')
  const [category, setCategory] = useState<typeof categories[number]>('All')
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => options.filter(option => (category === 'All' || option.category === category) && `${option.name} ${option.category}`.toLowerCase().includes(query.trim().toLowerCase())), [category, query])
  const tabValue = filtered.some(item => item.value === draft) ? draft : filtered[0]?.value

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=radio]'))
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0 || !buttons.length) return
    event.preventDefault()
    const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').length || 3
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + step + buttons.length) % buttons.length
    setDraft(filtered[next].value)
    buttons[next].focus({ preventScroll: true })
    buttons[next].scrollIntoView?.({ block: 'nearest' })
  }

  return <ModalSurface open onClose={onClose} labelledBy={titleId} describedBy={descriptionId} backdropClassName="ss-avatar-picker-backdrop" panelClassName="ss-avatar-picker">
    <header><h2 id={titleId}>Avatar style</h2><button type="button" className="ss-avatar-picker-close" aria-label="Close avatar styles" onClick={onClose}><X size={20} /></button></header>
    <div className="ss-avatar-picker-body">
      <div className="ss-avatar-picker-library">
        <div className="ss-avatar-picker-tools">
        <label className="ss-avatar-picker-search"><Search size={17} aria-hidden="true" /><input data-modal-autofocus aria-label="Find an avatar style" placeholder="Find a style…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="ss-avatar-picker-categories" aria-label="Style categories">{categories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
        </div>
        <div className="ss-avatar-picker-grid" role="radiogroup" aria-label="Avatar styles" onKeyDown={navigate}>
          {filtered.map(option => <button key={option.value} type="button" role="radio" aria-label={option.name} aria-checked={draft === option.value} tabIndex={tabValue === option.value ? 0 : -1} className="ss-avatar-picker-option" onClick={() => setDraft(option.value)}>
            <MemberAvatar src={src} name={name} size={48} ringStyle={option.value} ringColor={color} still />
            {draft === option.value && <Check size={14} className="ss-avatar-picker-check" aria-hidden="true" />}<span>{option.name}</span>
          </button>)}
        </div>
        {!filtered.length && <p role="status">No styles match. Try another name or category.</p>}
      </div>
      <aside className="ss-avatar-picker-preview" aria-label="Style preview">
        <MemberAvatar src={src} name={name} size={112} ringStyle={draft} ringColor={color} />
        <strong aria-live="polite">{avatarStyleName(draft)}</strong><small>Profile · Feed · Chat</small>
        <div className="ss-avatar-picker-sizes">{[44, 28].map(size => <MemberAvatar key={size} src={src} name={name} size={size} ringStyle={draft} ringColor={color} />)}</div>
      </aside>
    </div>
    <footer><small id={descriptionId}>Choose a style, then save your profile.</small><div><button type="button" onClick={onClose}>Cancel</button><button type="button" onClick={() => { onChange(draft); onClose() }}>Use style</button></div></footer>
  </ModalSurface>
}
