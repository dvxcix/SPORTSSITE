'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { researchSportForPath, type ResearchSport } from './researchNavigation'

const KEY = 'slipsurge:research-sport:v1'
const EVENT = 'slipsurge:research-sport'
let sessionSport: ResearchSport = 'mlb'

function readSport(): ResearchSport {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'mlb' || saved === 'nfl') return saved
  } catch { /* Blocked storage still supports an in-memory preference. */ }
  return sessionSport
}

function chooseSport(next: ResearchSport) {
  sessionSport = next
  try { localStorage.setItem(KEY, next) } catch { /* Private mode. */ }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) onChange() }
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener('storage', onStorage) }
}

export function useResearchSport(path: string) {
  const routeSport = researchSportForPath(path)
  const sport = useSyncExternalStore(subscribe, readSport, () => routeSport ?? 'mlb')
  // A new research route selects its sport. Manual switching remains possible
  // while browsing the menu without navigating away from the current page.
  useEffect(() => { if (routeSport) chooseSport(routeSport) }, [path, routeSport])
  return { sport, chooseSport }
}
