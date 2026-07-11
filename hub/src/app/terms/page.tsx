export const dynamic = 'force-static'

export default function TermsPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 80px', color: 'var(--text-1)' }}>
      <div style={{ background: 'rgba(255,184,77,0.08)', border: '1px solid rgba(255,184,77,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 28, fontSize: 13, color: 'var(--gold)' }}>
        Draft — this has not been reviewed by legal counsel. Treat it as a starting point, not a finished legal document.
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>Terms of Service</h1>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28 }}>Last updated: draft version</p>

      <Section title="1. What SlipSurge is">
        SlipSurge is a social platform for sharing sports picks, discussing games, and following other bettors'
        activity. SlipSurge is <strong>not a sportsbook</strong> — we do not accept wagers, hold funds for betting
        purposes, or pay out on bets. Any odds, wager amounts, or payouts you see on a pick or parlay post are
        self-reported by the user who posted it and are not verified against, or connected to, any real sportsbook
        account.
      </Section>

      <Section title="2. Accounts">
        You must be of legal age to use sports betting or fantasy sports products in your jurisdiction to create an
        account. You're responsible for the security of your account credentials and for all activity under your
        account. We may suspend or terminate accounts that violate these terms.
      </Section>

      <Section title="3. Paid features">
        SlipSurge Pro and creator subscriptions are billed through Stripe. Subscribing does not grant any betting
        product, wagering credit, or guarantee of any outcome — it unlocks platform features (e.g. premium content
        access) only. Refunds are handled on a case-by-case basis; contact support.
      </Section>

      <Section title="4. User content">
        You retain ownership of what you post. By posting, you grant SlipSurge a license to display, distribute, and
        promote that content within the platform. You're responsible for what you post — don't post anything
        illegal, harassing, or that infringes someone else's rights. We can remove content or accounts that violate
        this.
      </Section>

      <Section title="5. No investment or betting advice">
        Nothing on SlipSurge — including picks, records, win rates, or odds data — is financial or betting advice.
        Past performance shown on a user's profile does not indicate future results. Bet responsibly and only with
        licensed, regulated sportsbooks in your jurisdiction.
      </Section>

      <Section title="6. Disclaimer & liability">
        SlipSurge is provided "as is." We don't guarantee uptime, data accuracy (including odds, stats, or Statcast
        data sourced from third parties), or that any pick will be graded correctly. To the extent permitted by law,
        SlipSurge isn't liable for losses arising from your use of the platform or decisions made based on content
        you saw here.
      </Section>

      <Section title="7. Changes">
        We may update these terms as the product evolves. Continued use after a change means you accept the
        updated terms.
      </Section>

      <Section title="8. Contact">
        Questions about these terms? Reach out through the support contact listed in your account settings.
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
