type RegistrationError = {
  code?: string
  status?: number
  message?: string
  name?: string
}

export function registrationErrorMessage(error: RegistrationError) {
  const code = String(error.code ?? '').toLowerCase()
  const message = String(error.message ?? '').toLowerCase()

  if (code.includes('email_address_invalid') || message.includes('invalid email')) {
    return 'Enter a valid email address and try again.'
  }
  if (code.includes('weak_password') || message.includes('password')) {
    return 'Use a stronger password with at least 8 characters.'
  }
  if (code.includes('over_email_send_rate_limit') || error.status === 429 || message.includes('rate limit')) {
    return 'Too many confirmation emails were requested. Wait a few minutes, then try again.'
  }
  if (code.includes('user_already_exists') || message.includes('already registered') || message.includes('already exists')) {
    return 'An account already uses this email. Sign in or reset your password.'
  }
  if (code.includes('unexpected_failure') || error.status === 500 || error.name === 'AuthRetryableFetchError') {
    return 'Account setup could not finish or send its confirmation email. Try again, or continue with Discord or X.'
  }
  return 'Account setup could not finish. Review your email and password, then try again.'
}

export function normalizeRegistrationEmail(value: string) {
  return value.trim().toLowerCase()
}
