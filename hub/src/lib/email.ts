// Shared Resend sender + branded shell, extracted from the near-identical
// fetch('https://api.resend.com/emails') calls already duplicated across
// api/email/send-notification, api/settings/notify-password-changed, and
// api/onboarding/notify-welcome — every new transactional email (support
// actions below) reuses this instead of copy-pasting the Resend call and
// HTML table shell a fourth/fifth/sixth time.
export async function sendEmail({ to, subject, text, html }: {
  to: string; subject: string; text: string; html: string
}): Promise<boolean> {
  const apiKey = process.env.EMAIL_RESEND_API_KEY
  if (!apiKey) {
    console.error('[email] EMAIL_RESEND_API_KEY not configured')
    return false
  }
  const fromDomain = process.env.EMAIL_RESEND_EMAIL_DOMAIN || 'slipsurge.com'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `SlipSurge <team@${fromDomain}>`, to: [to], subject, text, html }),
    })
    if (!res.ok) {
      console.error('[email] Resend send failed', await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error('[email] threw', e)
    return false
  }
}

// Same dark-mode card shell every existing Resend email in this codebase
// already uses (send-notification, notify-password-changed) — kept as one
// shared builder so new transactional emails match without re-typing the
// inline styles.
export function brandedEmailHtml({ heading, bodyHtml, ctaLabel, ctaUrl, footerHtml }: {
  heading: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string; footerHtml?: string
}): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#06070A;padding:40px 0;font-family:-apple-system,Segoe UI,sans-serif;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#0B0D12;border:1px solid #1A1D24;border-radius:16px;overflow:hidden;">
<tr><td style="padding:32px 32px 0;text-align:center;">
<img src="https://www.slipsurge.com/logo.png" width="40" height="40" style="display:block;margin:0 auto 12px;" alt="SlipSurge" />
<div style="font-size:18px;font-weight:900;color:#F5F5F5;letter-spacing:-0.02em;">Slip<span style="color:#B4FF4D;">Surge</span></div>
</td></tr>
<tr><td style="padding:28px 32px 8px;text-align:center;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#F5F5F5;">${heading}</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#9CA3AF;">${bodyHtml}</p>
</td></tr>
${ctaLabel && ctaUrl ? `<tr><td style="padding:16px 32px 32px;text-align:center;">
<a href="${ctaUrl}" style="display:inline-block;background:#B4FF4D;color:#0B1600;font-weight:800;font-size:14px;padding:12px 32px;border-radius:99px;text-decoration:none;">${ctaLabel}</a>
</td></tr>` : ''}
${footerHtml ? `<tr><td style="padding:0 32px 28px;text-align:center;">${footerHtml}</td></tr>` : ''}
</table>
</td></tr>
</table>`
}
