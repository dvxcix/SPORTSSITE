'use client'

import useSWR from 'swr'
import { useAuth } from '@/context/AuthContext'

export function useNflAccess() {
  const { user, loading: authLoading } = useAuth()
  const { data, error, isLoading } = useSWR(user ? ['/api/account/nfl-access', user.id] : null,
    async ([url]: [string, string]) => {
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not check NFL access')
      return await response.json() as { allowed: boolean }
    }, { refreshInterval: 30_000, revalidateOnFocus: true, keepPreviousData: false })
  return { allowed: !!user && !error && data?.allowed === true, loading: authLoading || (!!user && isLoading), error }
}
