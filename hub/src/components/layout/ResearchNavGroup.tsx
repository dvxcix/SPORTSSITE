'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export type ResearchToolGroup = 'Boards' | 'Matchups' | 'Trends'
const nbaGroups: Record<string, ResearchToolGroup> = {
  'first-basket': 'Boards', cheatsheets: 'Boards', score: 'Boards', slate: 'Boards', public: 'Boards', 'game-markets': 'Boards',
  dvp: 'Matchups', matchup: 'Matchups', availability: 'Matchups',
  usage: 'Trends', tracking: 'Trends', divergence: 'Trends',
}
export function researchToolGroup(href: string): ResearchToolGroup | null {
  const [path, query] = href.split('?')
  const params = new URLSearchParams(query)
  if (path === '/the-paint') return nbaGroups[params.get('view') ?? ''] ?? null
  if (path === '/the-sideline') {
    const mode = params.get('mode')
    return mode === 'research' ? 'Matchups' : mode && ['cheatsheets','public','markets'].includes(mode) ? 'Boards' : null
  }
  return null
}

export function ResearchNavGroup({ label, active, children }: { label: ResearchToolGroup; active: boolean; children: ReactNode }) {
  const [state, setState] = useState({ active, open: active })
  if (state.active !== active) setState({ active, open: active })
  return <section className="ss-research-nav-group">
    <button type="button" aria-expanded={state.open} onClick={() => setState(value => ({ ...value, open: !value.open }))}><span>{label}</span><ChevronDown size={13} aria-hidden="true"/></button>
    <div hidden={!state.open}>{children}</div>
  </section>
}
