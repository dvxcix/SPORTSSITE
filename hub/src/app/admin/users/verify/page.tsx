import { AdminComingSoon } from '@/components/admin/AdminComingSoon'

export default function AdminVerificationRequestsPage() {
  return (
    <AdminComingSoon
      title="Verification Requests"
      missing={`There's no "request verification" flow on the site — users can't submit a request, so there's no queue to review. is_verified is just a flag you can flip directly for any user from All Users → their row → Actions.`}
    />
  )
}
