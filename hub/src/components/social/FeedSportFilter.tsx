'use client'

import { useRouter } from 'next/navigation'

/** One sport control; the timeline tabs keep their existing filter and sport. */
export function FeedSportFilter({ sport, filter, mlbAccess }: { sport?: string; filter: string; mlbAccess: boolean }) {
  const router = useRouter()
  return <label className="ss-feed-sport-select"><span className="sr-only">Feed sport</span>
    <select value={sport ?? 'All'} aria-label="Feed sport" onChange={event => {
      const query = new URLSearchParams({ filter })
      if (event.target.value !== 'All') query.set('sport', event.target.value)
      router.push(`/feed?${query}`)
    }}>
      {['All', ...(mlbAccess ? ['MLB'] : []), 'NFL', 'NBA'].map(league => <option key={league} value={league}>{league === 'All' ? 'All sports' : league}</option>)}
    </select>
  </label>
}
