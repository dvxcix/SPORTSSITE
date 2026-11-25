import type { NextRequest } from 'next/server'
import { GET as readOddsBoard } from '@/app/the-paint/odds-board/route'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const { error } = await requireNativeAccount(request)
  return error ?? await readOddsBoard(request)
}
