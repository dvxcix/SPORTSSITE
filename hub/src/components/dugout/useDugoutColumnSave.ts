'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DugoutColumnPrefs } from '@/lib/dugoutColumnPrefs'

/** A failed or uncertain write never changes the board or closes its editor. */
export function useDugoutColumnSave(userId: string | null, stored: DugoutColumnPrefs | null) {
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<{ owner: string | null; message: string } | null>(null)
  const owner = useRef(userId)
  const expected = useRef<DugoutColumnPrefs | null>(null)
  const inFlight = useRef(false)
  useLayoutEffect(() => { owner.current = userId }, [userId])

  useEffect(() => {
    expected.current = stored ? Object.fromEntries(Object.entries(stored).filter(([key]) => ['hiddenGroups', 'hiddenColumns', 'columnOrder'].includes(key))) as DugoutColumnPrefs : null
  }, [userId, stored])

  async function save(next: DugoutColumnPrefs): Promise<boolean> {
    if (inFlight.current) return false
    if (!userId) { setFailure({ owner: userId, message: 'Sign in to save your columns.' }); return false }
    const ownerId = userId
    inFlight.current = true
    setSaving(true); setFailure(null)
    const response = await fetch('/api/account/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'dugout-columns', value: next, expected: { dugout_column_prefs: expected.current } }) }).catch(() => null)
    inFlight.current = false
    setSaving(false)
    if (owner.current !== ownerId) return false
    if (!response?.ok) { setFailure({ owner: userId, message: response?.status === 409 ? 'Your columns could not be saved. Refresh and try again.' : 'Could not save your columns. Please try again.' }); return false }
    expected.current = { ...expected.current, ...next }
    return true
  }

  return { saving, error: failure?.owner === userId ? failure.message : '', clearError: () => setFailure(null), save }
}
