import {
  createToken,
  escapeHtml,
  htmlPage,
  parseToken,
  resendAddContact,
  resendSend,
  UNSUB_TTL_MS
} from '../../lib/newsletter.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const apiKey = env.RESEND_API_KEY;
    const from = env.RESEND_FROM_EMAIL;
    const audienceId = env.RESEND_AUDIENCE_ID;
    const secret = env.NEWSLETTER_SECRET;

    if (!apiKey || !from || !secret || !audienceId) {
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
    const added = await resendAddContact(apiKey, audienceId, email);
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
      subject: 'Welcome to AI Glimpse Daily',
      html: `
        <div style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 560px;">
          <p style="margin: 0 0 16px 0;">You're in. Each morning we send the AI stories worth your time: research, tools, policy, and the explainers that last.</p>
          <p style="margin: 0 0 16px 0;"><a href="${escapeHtml(base)}" style="color:#ff4d2e;font-weight:600;">Read today's coverage on AI Glimpse</a></p>
          <p style="margin: 24px 0 0 0; font-size: 13px; color: #888;"><a href="${escapeHtml(unsubUrl)}" style="color:#888;">Unsubscribe</a></p>
        </div>`,
      text: `Welcome to AI Glimpse Daily.\n\nRead: ${base}\n\nUnsubscribe: ${unsubUrl}`
    });

    return new Response(htmlPage({
      title: "You're subscribed!",
      body: 'Thanks for confirming. Your first AI Glimpse Daily digest will arrive on the next send day.',
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
