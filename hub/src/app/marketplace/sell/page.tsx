import { redirect } from 'next/navigation'

export default function MarketplaceSellRedirect() {
  redirect('/marketplace?share=1')
}
