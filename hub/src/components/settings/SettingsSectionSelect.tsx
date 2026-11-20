'use client'

import { useRouter } from 'next/navigation'

export function SettingsSectionSelect({ active, items }: { active: string; items: { href: string; label: string }[] }) {
  const router = useRouter()
  return <label className="ss-settings-section-select"><span className="sr-only">Settings section</span><select aria-label="Settings section" value={active} onChange={event => router.push(event.target.value)}>{items.map(item => <option key={item.href} value={item.href}>{item.label}</option>)}</select></label>
}
