import { DesignSystemLab } from './DesignSystemLab'

export const metadata = { title: 'Design System | SlipSurge Admin' }

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-6">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">SlipSurge UI</p>
        <h1 className="mt-1 text-2xl font-black text-[var(--text-1)]">Design system</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-2)]">The production reference for shared tokens, components, states, and interaction behavior.</p>
      </header>
      <DesignSystemLab />
    </div>
  )
}
