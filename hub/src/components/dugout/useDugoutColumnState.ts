'use client'

import { useState } from 'react'
import type { DugoutColumnPrefs } from '@/lib/dugoutColumnPrefs'

/** Never show a previous account's columns or open editor to a new account. */
export function useDugoutColumnState(userId: string | null, profileId: string | null, stored: DugoutColumnPrefs | null) {
  const matching = userId && profileId === userId ? stored : null
  const [observed, setObserved] = useState({ userId, profileId, stored })
  const [saved, setSaved] = useState<{ owner: string | null; value: DugoutColumnPrefs | null }>({ owner: userId, value: matching })
  const [open, setOpen] = useState(false)
  if (observed.userId !== userId || observed.profileId !== profileId || observed.stored !== stored) {
    setObserved({ userId, profileId, stored })
    setSaved({ owner: userId, value: matching })
    if (observed.userId !== userId) setOpen(false)
  }
  return {
    prefs: saved.owner === userId ? saved.value : null,
    stored: matching,
    open: saved.owner === userId && open,
    setPrefs: (value: DugoutColumnPrefs | null) => setSaved({ owner: userId, value }),
    setOpen,
  }
}
