import { notFound } from 'next/navigation'
import { DecorationsLab } from './DecorationsLab'

export default function DecorationsReviewPage() {
  if (process.env.NEXT_PUBLIC_DESIGN_REVIEW !== '1') notFound()
  return <DecorationsLab />
}
