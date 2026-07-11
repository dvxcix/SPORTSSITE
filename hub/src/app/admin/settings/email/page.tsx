import { AdminComingSoon } from '@/components/admin/AdminComingSoon'

export default function AdminEmailSettingsPage() {
  return (
    <AdminComingSoon
      title="Email Templates"
      missing="There's no custom email-sending system in this app — no Resend/SendGrid/SMTP integration exists. Auth emails (password reset, confirmation) are sent by Supabase Auth itself, and their templates are edited in the Supabase dashboard (Authentication → Email Templates), not here."
    />
  )
}
