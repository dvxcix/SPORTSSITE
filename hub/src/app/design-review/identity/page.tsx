import { notFound } from 'next/navigation'
import { IdentityLab } from './IdentityLab'

export default function IdentityReviewPage() {
  if (process.env.NEXT_PUBLIC_DESIGN_REVIEW !== '1') notFound()
  return <IdentityLab/>
}
