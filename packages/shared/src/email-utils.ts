export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'yopmail.com',
  'tempmail.com',
  'guerrillamail.com',
  'sharklasers.com',
  'dispostable.com',
  'getairmail.com',
  'maildrop.cc',
  'mintemail.com',
  'trashmail.com',
  '10minutemail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'tempmailaddress.com',
  'fakeinbox.com',
  'generator.email',
  'decoymail.com',
]);

export function normalizeEmail(email: string): string {
  const cleanEmail = email.trim().toLowerCase();
  const [localPart, domain] = cleanEmail.split('@');
  if (!localPart || !domain) return cleanEmail;
  
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const withoutPlus = localPart.split('+')[0];
    const withoutDots = withoutPlus.replace(/\./g, '');
    return `${withoutDots}@gmail.com`;
  }
  
  const withoutPlus = localPart.split('+')[0];
  return `${withoutPlus}@${domain}`;
}

export function isDisposableEmail(email: string): boolean {
  const cleanEmail = email.trim().toLowerCase();
  const [, domain] = cleanEmail.split('@');
  return domain ? DISPOSABLE_EMAIL_DOMAINS.has(domain) : false;
}
