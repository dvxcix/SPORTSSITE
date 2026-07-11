export const dynamic = 'force-static'

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 80px', color: 'var(--text-1)' }}>
      <div style={{ background: 'rgba(255,184,77,0.08)', border: '1px solid rgba(255,184,77,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 28, fontSize: 13, color: 'var(--gold)' }}>
        Draft — this has not been reviewed by legal counsel. Treat it as a starting point, not a finished legal document.
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28 }}>Last updated: draft version</p>

      <Section title="1. What we collect">
        Account info you provide (email, username, profile details), content you post (picks, parlays, comments,
        stories), and usage data (pages visited, features used). If you subscribe to a paid plan, Stripe processes
        your payment details directly — we never see or store your card number.
      </Section>

      <Section title="2. How we use it">
        To run the platform: authenticating you, showing your feed, grading picks against public game data,
        processing subscriptions, and sending account-related notifications. We don't sell your data to third
        parties.
      </Section>

      <Section title="3. Third-party services">
        We use Supabase for authentication and data storage, Stripe for payment processing, and public MLB
        Statcast/schedule data for game and player information shown on the platform. Each of these has its own
        privacy practices governing the data they handle on our behalf.
      </Section>

      <Section title="4. Public content">
        Picks, parlays, and posts you make are visible to other users per the visibility setting you choose (public,
        followers, or subscribers). Your posted win/loss record is visible on your public profile.
      </Section>

      <Section title="5. Data retention & deletion">
        We keep your account data as long as your account is active. You can request account deletion through
        support; some data (e.g. transaction records required for tax/legal purposes) may be retained as required
        by law.
      </Section>

      <Section title="6. Security">
        We use industry-standard practices (encrypted connections, row-level access controls) to protect your data,
        but no system is 100% secure. Use a strong, unique password for your account.
      </Section>

      <Section title="7. Changes">
        We may update this policy as the product evolves. Continued use after a change means you accept the
        updated policy.
      </Section>

      <Section title="8. Contact">
        Questions about this policy? Reach out through the support contact listed in your account settings.
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{title}</h2>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-2)' }}>{children}</p>
    </div>
  )
}
