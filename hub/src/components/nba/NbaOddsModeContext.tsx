'use client'
import { createContext, Fragment, useContext, type ReactNode } from 'react'
import type { NbaOddsMode } from '@/lib/nbaOddsMode'

const Context = createContext<NbaOddsMode>('pregame')
export const useNbaOddsMode = () => useContext(Context)

export function NbaOddsModeProvider({ mode, children }: { mode: NbaOddsMode; children: ReactNode }) {
  return <Context.Provider value={mode}><Fragment key={mode}>{children}</Fragment></Context.Provider>
}
