import { InfoPageShell, Section } from '@/components/marketing/InfoPageShell'

export const dynamic = 'force-static'

export default function ResponsibleGamblingPage() {
  return (
    <InfoPageShell title="Responsible Gambling">
      <div style={{ background: 'rgba(255,184,77,0.08)', border: '1px solid rgba(255,184,77,0.25)', borderRadius: 10, padding: '14px 16px', marginBottom: 28, fontSize: 13, color: 'var(--gold)', lineHeight: 1.6 }}>
        SlipSurge is a social platform, not a sportsbook. We don't accept wagers, hold funds for betting, or process
        bets of any kind. Nothing on this site should be treated as betting advice or a guarantee of any outcome.
      </div>

      <Section title="If you choose to bet with a licensed sportsbook">
        Only bet with licensed, regulated operators in your jurisdiction, and only with money you can afford to
        lose. Set a budget before you start and stick to it, regardless of what you see posted on SlipSurge or
        anywhere else.
      </Section>

      <Section title="Picks and records are not advice">
        A user's win/loss record, a hot streak, or a confident-sounding post is not a guarantee. Past results don't
        predict future outcomes, and every pick on this platform is one person's opinion, not financial or betting
        advice.
      </Section>

      <Section title="If gambling is becoming a problem">
        If you or someone you know is struggling with gambling, help is available:
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
          <li><strong>National Problem Gambling Helpline (US):</strong> 1-800-522-4700, available 24/7</li>
          <li><strong>Text:</strong> Text "GAMB" to 800-522-4700</li>
          <li><a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>ncpgambling.org</a> for state-by-state resources</li>
        </ul>
      </Section>

      <Section title="Age requirement">
        You must meet the minimum legal age for sports betting or fantasy sports in your jurisdiction to use
        SlipSurge.
      </Section>
    </InfoPageShell>
  )
}
