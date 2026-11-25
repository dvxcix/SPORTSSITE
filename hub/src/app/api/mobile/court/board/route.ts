import type { NextRequest } from 'next/server'
import { GET as readCourtBoard } from '@/app/the-paint/board/route'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const { error } = await requireNativeAccount(request)
  // The standard Court reader owns the tier gate, capture and archive policy.
  return error ?? await readCourtBoard(request)
}
