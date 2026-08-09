'use client'

import { useState } from 'react'
import { Bell, Check, Eye, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FeedbackState, SkeletonBlock } from '@/components/ui/feedback-state'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'

const SWATCHES = [
  ['Background', 'var(--bg)'], ['Surface', 'var(--surface)'], ['Raised', 'var(--surface-2)'],
  ['Accent', 'var(--accent)'], ['Success', 'var(--status-success)'], ['Warning', 'var(--status-warning)'],
  ['Danger', 'var(--status-danger)'], ['Info', 'var(--status-info)'],
] as const

const BOOKS = [
  ['FanDuel', 'var(--book-fanduel)'], ['DraftKings', 'var(--book-draftkings)'],
  ['Caesars', 'var(--book-caesars)'], ['Fanatics', 'var(--book-fanatics)'],
  ['BetMGM', 'var(--book-betmgm)'], ['BetRivers', 'var(--book-betrivers)'],
] as const

function LabSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-sm font-black text-[var(--text-1)]">{title}</h2>
        <p className="mt-1 text-xs text-[var(--text-3)]">{description}</p>
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function DesignSystemLab() {
  const [enabled, setEnabled] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="space-y-5">
      <LabSection title="Foundation" description="Semantic tokens used across web, desktop, charts, and data tables.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SWATCHES.map(([label, color]) => (
            <div key={label} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <span className="h-9 w-9 shrink-0 rounded-lg border border-white/10" style={{ background: color }} />
              <div><p className="text-xs font-bold text-[var(--text-1)]">{label}</p><p className="font-mono text-[10px] text-[var(--text-3)]">{color}</p></div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {BOOKS.map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--text-2)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />{label}
            </span>
          ))}
        </div>
      </LabSection>

      <LabSection title="Actions" description="Shared hierarchy, sizes, destructive treatment, and disabled behavior.">
        <div className="flex flex-wrap items-center gap-3">
          <Button><Plus size={15} />New item</Button>
          <Button variant="secondary"><Eye size={15} />Preview</Button>
          <Button variant="outline"><Bell size={15} />Notify</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive"><Trash2 size={15} />Delete</Button>
          <Button disabled>Unavailable</Button>
          <Button size="icon" variant="outline" aria-label="Confirm"><Check size={16} /></Button>
        </div>
      </LabSection>

      <LabSection title="Status and controls" description="Consistent status vocabulary and interactive states.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge><Badge variant="live"><span className="h-1.5 w-1.5 rounded-full bg-current" />Live</Badge>
          <Badge variant="final">Final</Badge><Badge variant="upcoming">Upcoming</Badge><Badge variant="pick">Public picks</Badge>
          <Badge variant="popular">Popular</Badge><Badge variant="save">Saved</Badge><Badge variant="danger">Failed</Badge><Badge variant="info">Cached</Badge>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <Switch checked={enabled} onChange={setEnabled} label="Desktop notifications" />
          <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>Open modal</Button>
        </div>
      </LabSection>

      <LabSection title="System feedback" description="Every data surface explicitly handles loading, empty, error, and offline states.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FeedbackState compact tone="loading" title="Loading movement" description="Retrieving the latest captured odds." />
          <FeedbackState compact tone="empty" title="Nothing captured" description="Try another market or date." />
          <FeedbackState compact tone="error" title="Could not load data" description="The request did not complete." actionLabel="Try again" onAction={() => undefined} />
          <FeedbackState compact tone="offline" title="You are offline" description="Cached data remains available." />
        </div>
        <div className="mt-4 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-[48px_1fr_100px]">
          <SkeletonBlock className="h-12 rounded-full" />
          <div className="space-y-2 py-1"><SkeletonBlock className="w-2/5" /><SkeletonBlock className="w-4/5" /></div>
          <SkeletonBlock className="h-8 self-center" />
        </div>
      </LabSection>

      {modalOpen ? (
        <Modal onClose={() => setModalOpen(false)} maxWidth={440} label="Design system modal example" showClose>
          <div className="p-6"><Badge variant="save">Modal standard</Badge>
            <h2 className="mt-3 text-lg font-black text-[var(--text-1)]">Clear, focused, and keyboard accessible</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">The shared shell handles focus, Escape, backdrop dismissal, layering, and screen-reader naming.</p>
            <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={() => setModalOpen(false)}>Confirm</Button></div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
