import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

/** Read only the explicitly named 3+ section, never the legacy gap column. */
async function readThreePlusHrr(date: string) {
  const admin = createAdminClient()
  const rows: Array<{ game_key: string; selection: string; odds: number; scraped_at: string }> = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from('fanduel_market_outcomes')
      .select('game_key,selection,odds,scraped_at')
      .eq('game_date', date)
      .ilike('section_name', 'Player To Record 3+ Hits + Runs + RBIs')
      .order('scraped_at').order('outcome_key')
      .range(offset, offset + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) break
  }
  return rows
}
export const getThreePlusHrrArchive = unstable_cache(readThreePlusHrr, ['hrr3-explicit-archive-v1'], { revalidate: 60 })
