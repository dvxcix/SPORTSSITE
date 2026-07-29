import { InfoPageShell, Section, Toc } from '@/components/marketing/InfoPageShell'

export const dynamic = 'force-static'

const TOC = [
  { id: 'acceptance', label: 'Acceptance of Terms' },
  { id: 'what-slipsurge-is', label: 'What SlipSurge Is' },
  { id: 'eligibility', label: 'Eligibility & Age' },
  { id: 'accounts', label: 'Account Registration & Security' },
  { id: 'billing', label: 'Subscriptions & Billing' },
  { id: 'conduct', label: 'Community Guidelines & Prohibited Conduct' },
  { id: 'user-content', label: 'User Content & License' },
  { id: 'ip', label: 'Intellectual Property' },
  { id: 'third-party', label: 'Third-Party Services & Data' },
  { id: 'no-advice', label: 'No Betting, Financial, or Investment Advice' },
  { id: 'disclaimers', label: 'Disclaimers; No Warranty' },
  { id: 'liability', label: 'Limitation of Liability' },
  { id: 'indemnification', label: 'Indemnification' },
  { id: 'termination', label: 'Termination' },
  { id: 'law-disputes', label: 'Governing Law & Dispute Resolution' },
  { id: 'misc', label: 'Miscellaneous' },
  { id: 'changes', label: 'Changes to These Terms' },
  { id: 'contact', label: 'Contact Us' },
]

export default function TermsPage() {
  return (
    <InfoPageShell title="Terms of Service" subtitle="Last updated: July 29, 2026 · SlipSurge LLC">
      <Toc items={TOC} />

      <Section id="acceptance" title="1. Acceptance of Terms">
        These Terms of Service (&quot;Terms&quot;) are a legal agreement between you and SlipSurge LLC
        (&quot;SlipSurge,&quot; &quot;we,&quot; &quot;us&quot;) governing your use of slipsurge.com and our mobile
        apps (together, the &quot;Service&quot;). By creating an account or otherwise using the Service, you agree
        to these Terms. If you don&apos;t agree, don&apos;t use the Service.
      </Section>

      <Section id="what-slipsurge-is" title="2. What SlipSurge Is">
        SlipSurge is a social and research platform for sports bettors — sharing picks, discussing games, and using
        research tools like the Dugout, Slate Breakdown, and Custom Matrices. <strong>SlipSurge is not a
        sportsbook.</strong> We do not accept wagers, hold funds for betting purposes, place bets on your behalf,
        or pay out on bets. Any odds, wager amounts, or payouts shown on a pick or parlay post are self-reported by
        the user who posted it and are not verified against, or connected to, any real sportsbook account.
      </Section>

      <Section id="eligibility" title="3. Eligibility & Age">
        You must be at least 18 years old to create a SlipSurge account. If you intend to place a real-money wager
        with a licensed sportsbook based on anything you see here, you&apos;re solely responsible for confirming
        you meet that sportsbook&apos;s and your jurisdiction&apos;s minimum age for sports betting — which is 21
        in most U.S. states and may be different elsewhere. By using the Service you represent that you meet these
        requirements.
      </Section>

      <Section id="accounts" title="4. Account Registration & Security">
        You&apos;re responsible for the accuracy of the information you provide when registering, for keeping your
        login credentials confidential, and for all activity that happens under your account. Tell us immediately
        at <a href="mailto:support@slipsurge.com" style={{ color: 'var(--accent)' }}>support@slipsurge.com</a> if
        you suspect unauthorized access. We may suspend or terminate accounts that violate these Terms, provide
        false information, or go through unusual account-recovery activity we can&apos;t verify.
      </Section>

      <Section id="billing" title="5. Subscriptions & Billing">
        Paid tiers (Basic, Advanced, Ultimate) are billed on a recurring basis through Whop, our third-party
        billing partner. Subscribing unlocks platform features (research tools, feed features, higher-tier content)
        only — it does not grant any betting product, wagering credit, or guarantee of any outcome. Your
        subscription renews automatically until you cancel; you can cancel any time from{' '}
        <a href="/settings/membership" style={{ color: 'var(--accent)' }}>Settings → Membership</a>, and
        cancellation takes effect at the end of your current billing period. Refunds are handled on a
        case-by-case basis — contact{' '}
        <a href="mailto:support@slipsurge.com" style={{ color: 'var(--accent)' }}>support@slipsurge.com</a>.
      </Section>

      <Section id="conduct" title="6. Community Guidelines & Prohibited Conduct">
        <p style={{ marginBottom: 12 }}>Using the Service, you agree not to:</p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Post content that&apos;s illegal, harassing, threatening, hateful, or that infringes someone else&apos;s rights;</li>
          <li>Impersonate another person or misrepresent your affiliation with anyone;</li>
          <li>Misrepresent your own betting results, or falsify a pick&apos;s outcome or odds;</li>
          <li>Attempt to access another user&apos;s account, scrape the Service at scale, or interfere with its normal operation;</li>
          <li>Use the Service to facilitate an actual wager, collect money for betting purposes, or run an unlicensed betting operation; or</li>
          <li>Violate any applicable law, including gambling laws in your jurisdiction.</li>
        </ul>
        <p style={{ marginTop: 12 }}>We can remove content or suspend/terminate accounts that violate this section, with or without notice.</p>
      </Section>

      <Section id="user-content" title="7. User Content & License">
        You retain ownership of the content you post (picks, comments, posts, images). By posting, you grant
        SlipSurge a worldwide, non-exclusive, royalty-free license to host, store, display, reproduce, and
        distribute that content within the Service — including showing it to other users per your chosen
        visibility setting, and generating a shareable image/preview of a post you create. This license ends when
        you delete the content or your account, except where it&apos;s been re-shared by another user or where we
        need to retain a copy for legal or safety reasons.
      </Section>

      <Section id="ip" title="8. Intellectual Property">
        The SlipSurge name, logo, and the Service&apos;s design, software, and original content are owned by
        SlipSurge LLC and protected by intellectual property law — you may not copy, modify, or reverse-engineer
        any part of it outside normal use of the Service. Team logos, player photos, and certain statistical data
        displayed on the Service are sourced from Major League Baseball&apos;s public Stats API and are the
        property of MLB and its member clubs; we display them for informational and statistical purposes only.
      </Section>

      <Section id="third-party" title="9. Third-Party Services & Data">
        The Service displays sports data, statistics, and betting odds aggregated from third-party sources
        (including MLB&apos;s public APIs, balldontlie, and publicly posted sportsbook lines). We do our best to
        keep this data accurate and current, but we don&apos;t control these sources and can&apos;t guarantee
        their accuracy, availability, or timeliness. SlipSurge is not affiliated with, sponsored by, or endorsed
        by MLB, any MLB club, or any sportsbook referenced on the Service.
      </Section>

      <Section id="no-advice" title="10. No Betting, Financial, or Investment Advice">
        Nothing on SlipSurge — including picks, records, win rates, Custom Matrix results, or odds data — is
        financial, investment, or betting advice, and none of it guarantees any outcome. A user&apos;s past
        performance, however it&apos;s displayed, does not predict future results. If you choose to bet, do so
        only with a licensed, regulated sportsbook in your jurisdiction, and only with money you can afford to
        lose. See our <a href="/responsible-gambling" style={{ color: 'var(--accent)' }}>Responsible Gambling</a> page.
      </Section>

      <Section id="disclaimers" title="11. Disclaimers; No Warranty">
        The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind,
        express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We
        don&apos;t guarantee the Service will be uninterrupted, error-free, or secure, or that any statistic, odds
        line, or pick grading will be accurate.
      </Section>

      <Section id="liability" title="12. Limitation of Liability">
        To the maximum extent permitted by law, SlipSurge LLC and its officers, employees, and service providers
        won&apos;t be liable for any indirect, incidental, special, consequential, or punitive damages, or for any
        loss of profits, data, or gambling losses, arising from your use of (or inability to use) the Service —
        even if we&apos;ve been advised of the possibility of such damages. Our total liability for any claim
        related to the Service is limited to the amount you paid us in the twelve months before the claim arose,
        or $100, whichever is greater.
      </Section>

      <Section id="indemnification" title="13. Indemnification">
        You agree to defend, indemnify, and hold harmless SlipSurge LLC from any claim, loss, or expense
        (including reasonable legal fees) arising from your use of the Service, your content, or your violation of
        these Terms or any law.
      </Section>

      <Section id="termination" title="14. Termination">
        You can stop using the Service and delete your account at any time from{' '}
        <a href="/settings/account" style={{ color: 'var(--accent)' }}>Settings → Account</a>. We may suspend or
        terminate your access to the Service, at our discretion, for violating these Terms, for extended
        inactivity, or to comply with a legal obligation. Sections that by their nature should survive termination
        (e.g. Intellectual Property, Limitation of Liability, Indemnification, Dispute Resolution) will continue
        to apply after your account is closed.
      </Section>

      <Section id="law-disputes" title="15. Governing Law & Dispute Resolution">
        These Terms are governed by the laws of the state in which SlipSurge LLC is organized, without regard to
        conflict-of-law principles. Before filing any formal claim, you agree to contact us at{' '}
        <a href="mailto:support@slipsurge.com" style={{ color: 'var(--accent)' }}>support@slipsurge.com</a> so we
        can try to resolve the dispute informally first.
      </Section>

      <Section id="misc" title="16. Miscellaneous">
        If any part of these Terms is found unenforceable, the rest remains in effect. These Terms, along with our{' '}
        <a href="/privacy" style={{ color: 'var(--accent)' }}>Privacy Policy</a>, are the entire agreement between
        you and SlipSurge regarding the Service. We may assign these Terms in connection with a merger,
        acquisition, or sale of assets; you may not assign your rights under these Terms without our consent.
      </Section>

      <Section id="changes" title="17. Changes to These Terms">
        We may update these Terms as the product evolves. If we make a material change, we&apos;ll update the
        &quot;Last updated&quot; date above and, where appropriate, notify you directly. Continued use of the
        Service after a change means you accept the updated Terms.
      </Section>

      <Section id="contact" title="18. Contact Us">
        SlipSurge LLC · <a href="mailto:support@slipsurge.com" style={{ color: 'var(--accent)' }}>support@slipsurge.com</a>
      </Section>
    </InfoPageShell>
  )
}
