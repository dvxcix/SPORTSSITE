import { AdminComingSoon } from '@/components/admin/AdminComingSoon'

export default function AdminJobsPage() {
  return (
    <AdminComingSoon
      title="Jobs"
      missing="There's no jobs/listings table in the database yet — the Jobs feature on the site itself hasn't been built either, so there's nothing for this page to manage."
    />
  )
}
