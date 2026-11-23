import 'server-only'
import { creatorWhop, getCreatorPaymentState } from './creatorWhop'
import { walletBalances, walletPayouts, type CreatorWallet, type CreatorWalletSession } from './creatorWallet'

export async function readCreatorWallet(accountId: string, after: string | null): Promise<CreatorWallet> {
  const state = await getCreatorPaymentState(accountId)
  const query = new URLSearchParams({ account_id: accountId, first: '20' })
  if (after) query.set('after', after)
  const [ledger, history] = await Promise.allSettled([
    creatorWhop<unknown>(`/ledger_accounts/${encodeURIComponent(accountId)}`).then(data => walletBalances(data, accountId)),
    creatorWhop<unknown>(`/payouts?${query}`).then(walletPayouts),
  ])
  return { balances: ledger.status === 'fulfilled' ? ledger.value : null, payouts: history.status === 'fulfilled' ? history.value.payouts : null, nextCursor: history.status === 'fulfilled' ? history.value.nextCursor : null, checkedAt: new Date().toISOString(), canPayout: state.canPayout, state: state.state, balanceError: ledger.status === 'rejected', historyError: history.status === 'rejected' }
}

export const walletScopes = {
  withdraw: ['company:balance:read', 'payout:account:read', 'payout:withdraw_funds', 'payout:destination:read', 'payout:create_destination'],
  verification: ['identity:read', 'identity:write'],
} as const

export async function createCreatorWalletSession(accountId: string, intent: 'withdraw' | 'verification', now = Date.now()): Promise<CreatorWalletSession> {
  const state = await getCreatorPaymentState(accountId)
  if (state.state === 'restricted' || intent === 'withdraw' && !state.canPayout) throw new Error('Account is not ready for this action')
  const expiresAt = new Date(now + 600_000).toISOString()
  // Empty/omitted scopes inherit the entire API key. Always pass explicit actions.
  const response = await creatorWhop<{ token: string; expires_at: string }>('/access_tokens', { account_id: accountId, scoped_actions: [...walletScopes[intent]], expires_at: expiresAt })
  if (typeof response.token !== 'string' || !response.token.length || response.token.length > 16384 || !Number.isFinite(Date.parse(response.expires_at)) || Date.parse(response.expires_at) <= now || Date.parse(response.expires_at) > now + 660_000) throw new Error('Invalid wallet session')
  return { accountId, token: response.token, expiresAt: response.expires_at, intent }
}
