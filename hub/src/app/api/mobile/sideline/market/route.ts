import { GET as readSidelineMarket } from '@/app/the-sideline/market/route'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { getNativeSidelineArchive } from '@/lib/nativeSidelineArchive'

export const maxDuration = 60

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  if (new URL(request.url).searchParams.get('projection') === 'archive') return getNativeSidelineArchive(request, account.userId)
  return readSidelineMarket(request)
}
