import { InfoPageShell, Section, Toc } from '@/components/marketing/InfoPageShell'

export const dynamic = 'force-static'

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'info-we-collect', label: 'Information We Collect' },
  { id: 'how-we-use', label: 'How We Use Your Information' },
  { id: 'sharing', label: 'How We Share Information' },
  { id: 'public-content', label: 'Public & Shared Content' },
  { id: 'cookies', label: 'Cookies & Similar Technologies' },
  { id: 'third-parties', label: 'Third-Party Services We Use' },
  { id: 'your-rights', label: 'Your Privacy Choices & Rights' },
  { id: 'retention', label: 'Data Retention & Deletion' },
  { id: 'security', label: 'Data Security' },
  { id: 'children', label: "Children's Privacy" },
  { id: 'international', label: 'International Users' },
  { id: 'changes', label: 'Changes to This Policy' },
  { id: 'contact', label: 'Contact Us' },
]

export default function PrivacyPage() {
  return (
    <InfoPageShell title="Privacy Policy" subtitle="Last updated: July 29, 2026 · SlipSurge LLC">
      <div style={{ background: 'rgba(255,184,77,0.08)', border: '1px solid rgba(255,184,77,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 28, fontSize: 13, color: 'var(--gold)', lineHeight: 1.6 }}>
        This has not been reviewed by legal counsel. Treat it as a good-faith, accurate description of what
        SlipSurge actually does with your data today — not a finished legal document.
      </div>

      <Toc items={TOC} />

      <Section id="overview" title="1. Overview">
        This policy describes how SlipSurge LLC (&quot;SlipSurge,&quot; &quot;we,&quot; &quot;us&quot;) collects,
        uses, shares, and protects information when you use slipsurge.com and our mobile apps (together, the
        &quot;Service&quot;). It applies to every visitor and account holder. By using the Service, you agree to
        the practices described here.
      </Section>

      <Section id="info-we-collect" title="2. Information We Collect">
        <p style={{ marginBottom: 12 }}><strong>Account information.</strong> Email address, username, password
        (stored as a salted hash, never in plain text), and profile details you choose to add (display name, bio,
        avatar/banner image).</p>
        <p style={{ marginBottom: 12 }}><strong>Sign-in via Discord or X.</strong> If you register or sign in
        through Discord or X (Twitter), we receive your account ID, username, and public profile photo from that
        provider so we can create and authenticate your SlipSurge account. We don&apos;t receive your password for
        that provider and can&apos;t post to it on your behalf beyond what you explicitly connect.</p>
        <p style={{ marginBottom: 12 }}><strong>Content you create.</strong> Posts, comments, picks, parlays,
        Custom Matrices, watchlist entries, and any other content you submit.</p>
        <p style={{ marginBottom: 12 }}><strong>Billing information.</strong> Subscriptions are processed by Whop,
        our payment and membership platform. We receive your tier, subscription status, and renewal dates from
        Whop — we never see or store your full card number.</p>
        <p style={{ marginBottom: 12 }}><strong>Device & usage data.</strong> IP address, browser/device type,
        pages viewed, and general usage patterns, collected automatically to keep the Service working and secure.
        If you enable push notifications, we store the device token needed to deliver them.</p>
        <p>
          <strong>Information we do <em>not</em> collect.</strong> We don&apos;t collect your sportsbook account
          credentials, betting history from any sportsbook, bank account or full payment card numbers, or Social
          Security number.
        </p>
      </Section>

      <Section id="how-we-use" title="3. How We Use Your Information">
        We use the information above to: create and secure your account; show you your feed, picks, and Dugout
        research tools; grade picks against public game data; process and manage your subscription; send
        account-related notifications (security alerts, billing receipts, password changes) and, if you opt in,
        push notifications about picks or activity; respond to support requests; and detect abuse, fraud, or
        violations of our <a href="/terms" style={{ color: 'var(--accent)' }}>Terms of Service</a>. We do not sell
        your personal information to third parties, and we do not use your data to place, facilitate, or influence
        any real-money wager.
      </Section>

      <Section id="sharing" title="4. How We Share Information">
        We share information only in these situations: with service providers who process it on our behalf under
        their own confidentiality obligations (see Section 7); when you make content public per your own visibility
        settings; to comply with a legal obligation, subpoena, or valid government request; to protect the rights,
        property, or safety of SlipSurge, our users, or the public; or with your consent. We do not share your
        information with advertisers or data brokers for their own marketing purposes.
      </Section>

      <Section id="public-content" title="5. Public & Shared Content">
        Picks, parlays, comments, and posts you create are visible to other users according to the visibility
        setting you choose for that content — public, followers-only, or private. Your username, avatar, and
        (unless you enable the hide-win-rate setting) your posted win/loss record are visible on your public
        profile. Anything you post publicly can be viewed, and potentially re-shared, by anyone — don&apos;t post
        information you wouldn&apos;t want to be public.
      </Section>

      <Section id="cookies" title="6. Cookies & Similar Technologies">
        We use strictly necessary cookies to keep you signed in and to remember basic preferences (like your
        light/dark theme choice). We do not currently use third-party advertising or cross-site tracking cookies.
        If that changes, we&apos;ll update this section and, where required, ask for your consent first.
      </Section>

      <Section id="third-parties" title="7. Third-Party Services We Use">
        <p style={{ marginBottom: 12 }}>
          Running SlipSurge means relying on a handful of specialized providers, each of which processes a slice of
          your data under its own privacy practices:
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.8 }}>
          <li><strong>Supabase</strong> — authentication, database, and file storage for your account and content.</li>
          <li><strong>Whop</strong> — subscription billing and membership management.</li>
          <li><strong>Vercel</strong> — application hosting and delivery.</li>
          <li><strong>MLB&apos;s public Stats API and Statcast data</strong> — game schedules, box scores, player
          bios, and official player headshots/team logos, used to power research tools like the Dugout and Slate
          Breakdown. This is public league data, not information about you.</li>
          <li><strong>balldontlie and public sportsbook lines</strong> (FanDuel, BetMGM, Caesars, and others) — we
          aggregate publicly posted betting odds for display in our research tools. SlipSurge is not affiliated
          with, and does not share your data with, any sportsbook.</li>
        </ul>
        <p>
          Each provider only receives the data it needs to perform its function for us — none of them is authorized
          to use your data for their own independent purposes.
        </p>
      </Section>

      <Section id="your-rights" title="8. Your Privacy Choices & Rights">
        Depending on where you live, you may have the right to access, correct, export, or delete your personal
        information, and to object to or restrict certain processing. You can update most account details yourself
        in <a href="/settings" style={{ color: 'var(--accent)' }}>Settings</a>, or email{' '}
        <a href="mailto:support@slipsurge.com" style={{ color: 'var(--accent)' }}>support@slipsurge.com</a> for
        anything else, including a full data export or deletion request. We&apos;ll respond within a reasonable
        time and verify your identity before acting on the request.
      </Section>

      <Section id="retention" title="9. Data Retention & Deletion">
        We keep your account data for as long as your account is active, plus a limited period afterward in case
        you return or a legal/tax obligation requires it. When you delete your account, we delete or anonymize
        your personal information within a reasonable timeframe, except data we&apos;re required to retain by law
        (e.g. billing records) or that&apos;s embedded in another user&apos;s content (e.g. a reply to your
        comment) — that record stays, attributed to a deleted account.
      </Section>

      <Section id="security" title="10. Data Security">
        We use industry-standard safeguards — encrypted connections (HTTPS/TLS), hashed passwords, and row-level
        database access controls that scope every query to the requesting user — to protect your information. No
        system is 100% secure, so we can&apos;t guarantee absolute security. Use a strong, unique password and
        enable any additional account protection we offer.
      </Section>

      <Section id="children" title="11. Children's Privacy">
        SlipSurge is not directed at, and is not intended for use by, anyone under 18. We do not knowingly collect
        personal information from anyone under 18. If we learn we&apos;ve collected information from a user under
        18, we&apos;ll delete it. If you believe a child has provided us information, contact{' '}
        <a href="mailto:support@slipsurge.com" style={{ color: 'var(--accent)' }}>support@slipsurge.com</a>.
      </Section>

      <Section id="international" title="12. International Users">
        SlipSurge is operated from the United States and our servers and service providers are primarily based
        there. If you access the Service from outside the U.S., your information will be transferred to and
        processed in the U.S., where privacy laws may differ from those in your home country.
      </Section>

      <Section id="changes" title="13. Changes to This Policy">
        We may update this policy as the product evolves. If we make a material change, we&apos;ll update the
        &quot;Last updated&quot; date above and, where appropriate, notify you directly. Continued use of the
        Service after a change means you accept the updated policy.
      </Section>

      <Section id="contact" title="14. Contact Us">
        SlipSurge LLC · <a href="mailto:support@slipsurge.com" style={{ color: 'var(--accent)' }}>support@slipsurge.com</a>
        <br />
        Questions about this policy, or a request to access, export, or delete your data, can go to the address
        above.
      </Section>
    </InfoPageShell>
  )
}
