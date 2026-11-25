import { respondToCommunityInvite } from '@/lib/communityInviteServer'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  return respondToCommunityInvite(request, account.supabase, account.userId)
}
