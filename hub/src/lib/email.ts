// Shared Resend sender and responsive branded shell. Transactional and
// operational email paths use this instead of maintaining separate sender
// configuration and drifting visual templates.
export async function sendEmail({ to, subject, text, html }: {
  to: string | string[]; subject: string; text: string; html: string
}): Promise<boolean> {
  const apiKey = process.env.EMAIL_RESEND_API_KEY || process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[email] Resend API key not configured')
    return false
  }
  const fromDomain = process.env.EMAIL_RESEND_EMAIL_DOMAIN || process.env.RESEND_EMAIL_DOMAIN || 'slipsurge.com'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `SlipSurge <team@${fromDomain}>`, to: Array.isArray(to) ? to : [to], subject, text, html }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.error('[email] Resend send failed', { status: res.status })
      return false
    }
    return true
  } catch (e) {
    console.error('[email] request failed', { type: e instanceof Error ? e.name : typeof e })
    return false
  }
}

// Table-based and inline-styled for dependable rendering in Gmail, Outlook,
// Apple Mail, and mobile clients while preserving SlipSurge's dark visual
// system and high-contrast CTA treatment.
export function brandedEmailHtml({ heading, bodyHtml, ctaLabel, ctaUrl, footerHtml, preheader, eyebrow }: {
  heading: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  footerHtml?: string
  preheader?: string
  eyebrow?: string
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<style>@media only screen and (max-width:560px){.email-shell{width:100%!important}.email-pad{padding-left:22px!important;padding-right:22px!important}}</style>
</head>
<body style="margin:0;padding:0;background:#06070A;color:#F5F5F5;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#06070A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" class="email-shell" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:#0B0D12;border:1px solid #242A33;border-radius:20px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.42);">
<tr><td style="height:3px;background:linear-gradient(90deg,#B4FF4D 0%,#5EEAD4 55%,#22D3EE 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="email-pad" style="padding:32px 34px 0;text-align:center;">
<img src="https://www.slipsurge.com/logo.png" width="46" height="46" style="display:block;margin:0 auto 12px;border:0;border-radius:14px;" alt="SlipSurge" />
<div style="font-size:19px;font-weight:900;color:#F8FAFC;letter-spacing:-.02em;">Slip<span style="color:#B4FF4D;">Surge</span></div>
</td></tr>
<tr><td class="email-pad" style="padding:28px 34px 10px;text-align:center;">
${eyebrow ? `<div style="margin:0 0 10px;font-size:11px;line-height:1.4;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#B4FF4D;">${eyebrow}</div>` : ''}
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;font-weight:900;color:#F8FAFC;letter-spacing:-.025em;">${heading}</h1>
<div style="margin:0;font-size:14px;line-height:1.7;color:#AAB2BF;">${bodyHtml}</div>
</td></tr>
${ctaLabel && ctaUrl ? `<tr><td class="email-pad" style="padding:18px 34px 32px;text-align:center;">
<a href="${ctaUrl}" style="display:inline-block;background:#B4FF4D;color:#0B1600;font-weight:900;font-size:14px;line-height:1;padding:14px 30px;border:1px solid #C7FF78;border-radius:999px;text-decoration:none;box-shadow:0 8px 28px rgba(180,255,77,.18);">${ctaLabel}</a>
</td></tr>` : ''}
<tr><td class="email-pad" style="padding:${ctaLabel && ctaUrl ? '0' : '18px'} 34px 28px;text-align:center;border-top:1px solid #1B2028;">
${footerHtml || '<p style="margin:0;font-size:11px;line-height:1.6;color:#687181;">SlipSurge · Built for sharper sports decisions</p>'}
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;line-height:1.5;color:#596170;">© ${new Date().getFullYear()} SlipSurge</p>
</td></tr>
</table>
</body>
</html>`
}
