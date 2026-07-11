import { InfoPageShell, Section } from '@/components/marketing/InfoPageShell'
import { Mail } from 'lucide-react'

export const dynamic = 'force-static'

export default function SupportPage() {
  return (
    <InfoPageShell title="Support" subtitle="Need help with your account, a payment, or something you saw on the platform?">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 28 }}>
        <Mail size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>support@slipsurge.com</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>We aim to respond within 1-2 business days.</p>
        </div>
      </div>

      <Section title="Account & billing">
        Questions about your subscription, a charge, or account access — include the email your account is
        registered under so we can look it up quickly.
      </Section>
      <Section title="Report a problem">
        Found a bug, a grading mistake on a pick, or something that looks wrong? Tell us what you were doing right
        before it happened — that's the fastest way for us to reproduce and fix it.
      </Section>
      <Section title="Report abuse or a policy violation">
        You can report a post, comment, or user directly from the platform using the report button — our team
        reviews every report. For anything urgent, email us directly.
      </Section>
    </InfoPageShell>
  )
}
