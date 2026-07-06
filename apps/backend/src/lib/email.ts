import { Buffer } from 'buffer';

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

/**
 * Sends an email using Mailgun's API.
 * Falls back to console logging in development if Mailgun keys are not set.
 */
export async function sendEmail({ to, subject, text, html, from }: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const defaultFrom = process.env.MAILGUN_FROM_EMAIL || 'Envoyou <noreply@envoyou.com>';
  
  const fromSender = from || defaultFrom;

  console.log(`[EMAIL_SENDER] Preparing email to: ${to}, Subject: "${subject}"`);

  if (!apiKey || !domain) {
    console.warn('[EMAIL_SENDER] Mailgun keys not configured in environment. Printing email to console instead:');
    console.log('--------------------------------------------------');
    console.log(`FROM: ${fromSender}`);
    console.log(`TO: ${to}`);
    console.log(`SUBJECT: ${subject}`);
    console.log('BODY (TEXT):');
    console.log(text);
    if (html) {
      console.log('BODY (HTML):');
      console.log(html);
    }
    console.log('--------------------------------------------------');
    return true;
  }

  try {
    const authHeader = `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`;
    const url = `https://api.mailgun.net/v3/${domain}/messages`;

    const formData = new URLSearchParams();
    formData.append('from', fromSender);
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('text', text);
    if (html) {
      formData.append('html', html);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[EMAIL_SENDER] Mailgun API error (status ${response.status}):`, errorText);
      return false;
    }

    const data = await response.json();
    console.log('[EMAIL_SENDER] Email sent successfully via Mailgun:', data);
    return true;
  } catch (error) {
    console.error('[EMAIL_SENDER] Error sending email via Mailgun:', error);
    return false;
  }
}
