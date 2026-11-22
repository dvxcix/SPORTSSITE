/** Creator commerce uses the current Whop contract; main tier billing keeps its own adapter. */
export type CreatorAccount = {
  id: string
  parent_account?: { id: string } | null
  external_id?: string | null
  status?: string | null
  capabilities?: { accept_card_payments?: string; standard_payout?: string } | null
  required_actions?: { title: string; status: string; blocked_capabilities?: string[] }[] | null
}

export type CreatorPaymentState = {
  state: 'not_connected' | 'onboarding' | 'pending' | 'ready' | 'restricted' | 'unavailable'
  canCharge: boolean
  canPayout: boolean
  actions: { title: string; pending: boolean }[]
}

export function creatorPaymentState(account: CreatorAccount, parentId: string): CreatorPaymentState {
  if (account.parent_account?.id !== parentId) throw new Error('Creator account is outside this platform')
  const actions = (account.required_actions ?? []).map(item => ({ title: item.title, pending: item.status === 'pending' }))
  const canCharge = account.status === 'active' && account.capabilities?.accept_card_payments === 'active'
  return {
    state: account.status === 'suspended' ? 'restricted' : canCharge ? 'ready' : !account.capabilities ? 'unavailable' : account.capabilities.accept_card_payments === 'pending' ? 'pending' : 'onboarding',
    canCharge,
    canPayout: account.status === 'active' && account.capabilities?.standard_payout === 'active',
    actions,
  }
}

export function hasCurrentCreatorAccess(record: { status: string; current_period_end?: string | null }, now = Date.now()) {
  return ['active', 'trialing'].includes(record.status)
    && (record.current_period_end == null || Date.parse(record.current_period_end) > now)
}

export function creatorOfferPayload(input: { accountId: string; productId: string; creatorId: string; title: string; description: string | null; price: number; recurring: boolean; fee: number; returnUrl: string }) {
  const metadata = { slipsurge_product_id: input.productId, slipsurge_creator_id: input.creatorId }
  return {
    account_id: input.accountId, redirect_url: input.returnUrl, metadata,
    variant: {
      title: input.title, description: input.description, initial_price: input.price,
      billing_type: input.recurring ? 'renewal' : 'one_time',
      ...(input.recurring ? { billing_period: 30, renewal_price: input.price } : {}),
      currency: 'usd', application_fee_amount: input.fee, metadata,
      visibility: 'hidden', stock: 0, unlimited_stock: false,
    },
  }
}
