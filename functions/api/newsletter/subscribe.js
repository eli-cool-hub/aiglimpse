import {
  createToken,
  escapeHtml,
  isValidEmail,
  normalizeEmail,
  resendSend,
  siteBase
} from '../../lib/newsletter.js';

export async function onRequestPost(context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const apiKey = env.RESEND_API_KEY;
    const from = env.RESEND_FROM_EMAIL;
    const secret = env.NEWSLETTER_SECRET;

    if (!apiKey || !from || !secret) {
      return Response.json({ error: 'Newsletter is not configured yet.' }, { status: 503, headers });
    }

    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
      return Response.json({ error: 'Please enter a valid email address.' }, { status: 400, headers });
    }

    const token = await createToken(email, secret, { purpose: 'verify' });
    const base = siteBase(request);
    const verifyUrl = `${base}/api/newsletter/verify?token=${encodeURIComponent(token)}`;

    const subject = 'Confirm your AI Glimpse Daily subscription';
    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.6; color: #111; max-width: 560px;">
        <p style="margin: 0 0 16px 0;">Hi,</p>
        <p style="margin: 0 0 16px 0;">Confirm your email to receive <strong>AI Glimpse Daily</strong>, a morning roundup of the AI stories that matter.</p>
        <p style="margin: 0 0 24px 0;">
          <a href="${escapeHtml(verifyUrl)}" style="display: inline-block; padding: 12px 20px; background: #ff4d2e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Confirm subscription</a>
        </p>
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Or paste this link in your browser:</p>
        <p style="margin: 0; font-size: 13px; word-break: break-all; color: #444;">${escapeHtml(verifyUrl)}</p>
        <p style="margin: 24px 0 0 0; font-size: 13px; color: #888;">Link expires in 24 hours. If you did not subscribe, ignore this email.</p>
      </div>`;
    const text = `Confirm AI Glimpse Daily:\n${verifyUrl}\n\nExpires in 24 hours.`;

    const sent = await resendSend(apiKey, { from, to: [email], subject, html, text });
    if (!sent.ok) {
      return Response.json(
        { error: sent.data?.message || sent.data?.error || 'Could not send confirmation email.' },
        { status: 500, headers }
      );
    }

    return Response.json({ ok: true, message: 'Check your inbox to confirm.' }, { headers });
  } catch {
    return Response.json({ error: 'Unexpected server error.' }, { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}
