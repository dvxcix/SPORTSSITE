import { GET as readSidelineMarket } from '@/app/the-sideline/market/route'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 60

export async function GET(request: Request) {
  const { error } = await requireNativeAccount(request)
  return error ?? await readSidelineMarket(request)
}
