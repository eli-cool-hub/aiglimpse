import {
  createToken,
  escapeHtml,
  htmlPage,
  parseToken,
  resendAddToSegment,
  resendSend,
  UNSUB_TTL_MS
} from '../../lib/newsletter.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const apiKey = env.RESEND_API_KEY;
    const from = env.RESEND_FROM_EMAIL;
    const segmentId = env.RESEND_SEGMENT_ID || env.RESEND_AUDIENCE_ID;
    const secret = env.NEWSLETTER_SECRET;

    if (!apiKey || !from || !secret || !segmentId) {
      return new Response(htmlPage({
        title: 'Not configured',
        body: 'Newsletter signup is not fully configured yet. Please try again later.',
        ok: false
      }), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const parsed = await parseToken(token, secret, 'verify');

    if (!parsed) {
      return new Response(htmlPage({
        title: 'Invalid or expired link',
        body: 'This confirmation link is invalid or expired. Please subscribe again from the homepage.',
        ok: false
      }), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const { email } = parsed;
    const added = await resendAddToSegment(apiKey, segmentId, email);
    if (!added.ok) {
      return new Response(htmlPage({
        title: 'Could not subscribe',
        body: escapeHtml(added.data?.message || 'We could not add you to the list. Please try again.'),
        ok: false
      }), { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const unsubToken = await createToken(email, secret, { purpose: 'unsub', ttlMs: UNSUB_TTL_MS });
    const base = `${url.protocol}//${url.host}`;
    const unsubUrl = `${base}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

    await resendSend(apiKey, {
      from,
      to: [email],
      subject: "You're on the AI Glimpse Daily list",
      html: `
        <div style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 560px;">
          <p style="margin: 0 0 16px 0;">You're on the list. We're building AI Glimpse Daily and will email you when the morning digest launches.</p>
          <p style="margin: 0 0 16px 0;">Until then, <a href="${escapeHtml(base)}" style="color:#ff4d2e;font-weight:600;">read the latest on AI Glimpse</a>.</p>
          <p style="margin: 24px 0 0 0; font-size: 13px; color: #888;"><a href="${escapeHtml(unsubUrl)}" style="color:#888;">Unsubscribe</a></p>
        </div>`,
      text: `You're on the AI Glimpse Daily list. We'll email you when the digest launches.\n\nRead: ${base}\n\nUnsubscribe: ${unsubUrl}`
    });

    return new Response(htmlPage({
      title: "You're on the list!",
      body: "Thanks for confirming. We'll email you when AI Glimpse Daily launches. Until then, browse the latest stories on the site.",
      ok: true
    }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch {
    return new Response(htmlPage({
      title: 'Something went wrong',
      body: 'Please try again later.',
      ok: false
    }), { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
