import { redirect } from 'next/navigation'

// /admin/reports already lists every report (posts, comments, everything
// else target_type covers) — this would just be a filtered duplicate, and
// target_type's actual values aren't documented anywhere, so filtering here
// risks silently hiding real reports behind a guessed-wrong value.
export default function AdminContentReportsPage() {
  redirect('/admin/reports')
}
