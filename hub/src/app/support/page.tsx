import { InfoCallout, InfoInlineLink, InfoPageShell, Section } from '@/components/marketing/InfoPageShell'
import { Mail } from 'lucide-react'

export const dynamic = 'force-static'

export default function SupportPage() {
  return (
    <InfoPageShell title="Support" subtitle="Need help with your account, a payment, or something you saw on the platform?">
      <InfoCallout icon={<Mail size={18} />} title="support@slipsurge.com" description="We aim to respond within 1-2 business days." href="mailto:support@slipsurge.com" />

      <Section title="Account & billing">
        Questions about your subscription, a charge, or account access — include the email your account is
        registered under so we can look it up quickly. You can also review your <InfoInlineLink href="/settings/membership">membership settings</InfoInlineLink> directly.
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
