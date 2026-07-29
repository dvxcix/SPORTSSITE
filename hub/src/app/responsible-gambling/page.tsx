import { InfoPageShell, Section, Toc } from '@/components/marketing/InfoPageShell'

export const dynamic = 'force-static'

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'betting-responsibly', label: 'Betting Responsibly' },
  { id: 'not-advice', label: 'Picks & Records Are Not Advice' },
  { id: 'warning-signs', label: 'Warning Signs of a Gambling Problem' },
  { id: 'self-exclusion', label: 'Self-Exclusion Programs' },
  { id: 'get-help', label: 'Get Help' },
  { id: 'age', label: 'Age Requirement' },
  { id: 'contact', label: 'Contact Us' },
]

export default function ResponsibleGamblingPage() {
  return (
    <InfoPageShell title="Responsible Gambling" subtitle="Last updated: July 29, 2026 · SlipSurge LLC">
      <div style={{ background: 'rgba(255,184,77,0.08)', border: '1px solid rgba(255,184,77,0.25)', borderRadius: 10, padding: '14px 16px', marginBottom: 28, fontSize: 13, color: 'var(--gold)', lineHeight: 1.6 }}>
        SlipSurge is a social and research platform, not a sportsbook. We don&apos;t accept wagers, hold funds for
        betting, or process bets of any kind. Nothing on this site is betting advice or a guarantee of any outcome.
      </div>

      <Toc items={TOC} />

      <Section id="overview" title="1. Overview">
        Sports betting can be entertaining when it&apos;s done within limits you&apos;ve set for yourself. This
        page exists because SlipSurge&apos;s community is built around real-money betting culture, even though we
        ourselves never touch a real wager — and we&apos;d rather you have this information in front of you than
        assume you&apos;ve already found it elsewhere.
      </Section>

      <Section id="betting-responsibly" title="2. Betting Responsibly">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Only bet with licensed, regulated sportsbooks operating legally in your jurisdiction.</li>
          <li>Set a budget before you start, and never bet more than you can afford to lose — regardless of what you see posted on SlipSurge or anywhere else.</li>
          <li>Set a time limit for how long you&apos;ll engage with betting activity in a given session.</li>
          <li>Never chase losses by increasing your stakes to win back money you&apos;ve already lost.</li>
          <li>Don&apos;t bet under the influence of alcohol or other substances that impair judgment.</li>
          <li>Treat betting as entertainment you&apos;re paying for, not as a source of income.</li>
          <li>Take regular breaks, and don&apos;t let betting activity crowd out other parts of your life.</li>
          <li>Most licensed sportsbooks offer deposit limits, loss limits, and cool-off/self-exclusion tools directly in their app — use them if you have any doubt about your own limits.</li>
        </ul>
      </Section>

      <Section id="not-advice" title="3. Picks & Records Are Not Advice">
        A user&apos;s win/loss record, a hot streak, or a confident-sounding post is not a guarantee of anything.
        Past results — a user&apos;s, or a Custom Matrix&apos;s historical hit rate — don&apos;t predict future
        outcomes. Every pick, take, or Matrix result on this platform reflects one person&apos;s (or one saved
        rule&apos;s) opinion or history, not financial or betting advice, and SlipSurge doesn&apos;t verify that
        any of it is accurate before it&apos;s posted.
      </Section>

      <Section id="warning-signs" title="4. Warning Signs of a Gambling Problem">
        <p style={{ marginBottom: 10 }}>Consider stepping back and reaching out for support if you notice yourself:</p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Betting more money or more often than you intended to;</li>
          <li>Lying to family or friends about how much time or money you&apos;re spending on betting;</li>
          <li>Chasing losses, or betting to escape stress, anxiety, or other problems;</li>
          <li>Borrowing money, missing bills, or going into debt to fund betting;</li>
          <li>Feeling restless or irritable when trying to cut back or stop; or</li>
          <li>Neglecting work, school, relationships, or responsibilities because of betting.</li>
        </ul>
        <p style={{ marginTop: 10 }}>Any one of these on its own is worth paying attention to — you don&apos;t need to hit a breaking point before it&apos;s worth reaching out for help.</p>
      </Section>

      <Section id="self-exclusion" title="5. Self-Exclusion Programs">
        If you want to stop yourself from being able to bet, most states run a self-exclusion program that bars
        you from licensed sportsbooks and casinos statewide — a stronger step than closing an individual sportsbook
        account, since it&apos;s enforced across every licensed operator in that state. The National Council on
        Problem Gambling maintains a directory of state-by-state self-exclusion programs at{' '}
        <a href="https://www.ncpgambling.org/help-treatment/self-exclusion/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          ncpgambling.org/help-treatment/self-exclusion
        </a>.
      </Section>

      <Section id="get-help" title="6. Get Help">
        <p style={{ marginBottom: 10 }}>If you or someone you know is struggling with gambling, free, confidential help is available 24/7:</p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li><strong>Call:</strong> <a href="tel:1-800-426-2537" style={{ color: 'var(--accent)' }}>1-800-GAMBLER</a> (1-800-426-2537), the national helpline promoted by the American Gaming Association and most U.S. sportsbooks.</li>
          <li><strong>Call or text:</strong> <a href="tel:1-800-697-3738" style={{ color: 'var(--accent)' }}>1-800-MY-RESET</a> (1-800-697-3738), the National Problem Gambling Helpline — call, text, or chat, 24/7/365.</li>
          <li><strong>Online:</strong> <a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>ncpgambling.org</a> for chat support and state-by-state resources.</li>
          <li><strong>Peer support:</strong> <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>gamblersanonymous.org</a> for local Gamblers Anonymous meetings.</li>
        </ul>
      </Section>

      <Section id="age" title="7. Age Requirement">
        You must be at least 18 to create a SlipSurge account. If you intend to place a real-money wager based on
        anything you see here, you&apos;re responsible for confirming you meet the minimum legal age for sports
        betting in your own jurisdiction — 21 in most U.S. states, and potentially different elsewhere.
      </Section>

      <Section id="contact" title="8. Contact Us">
        SlipSurge LLC · <a href="mailto:support@slipsurge.com" style={{ color: 'var(--accent)' }}>support@slipsurge.com</a>
      </Section>
    </InfoPageShell>
  )
}
