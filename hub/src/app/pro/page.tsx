import { redirect } from 'next/navigation'

// Preserve old links while keeping every membership purchase on Whop.
export default function ProPlanPage() {
  redirect('/pricing')
}
