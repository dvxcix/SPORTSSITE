import type { NextRequest } from 'next/server'
import { GET as readCourtSchedule } from '@/app/the-paint/schedule/route'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 30

export async function GET(request: NextRequest) {
  const rejected = await requireNativeAccount(request)
  // The reader still enforces NBA access for the verified account.
  return rejected ?? await readCourtSchedule(request)
}
