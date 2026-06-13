import { htmlPage, parseToken, resendRemoveFromSegment } from '../../lib/newsletter.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const apiKey = env.RESEND_API_KEY;
    const segmentId = env.RESEND_SEGMENT_ID || env.RESEND_AUDIENCE_ID;
    const secret = env.NEWSLETTER_SECRET;

    if (!apiKey || !secret || !segmentId) {
      return new Response(htmlPage({
        title: 'Not configured',
        body: 'Unsubscribe is not available right now.',
        ok: false
      }), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const parsed = await parseToken(token, secret, 'unsub');

    if (!parsed) {
      return new Response(htmlPage({
        title: 'Invalid link',
        body: 'This unsubscribe link is invalid or expired.',
        ok: false
      }), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    await resendRemoveFromSegment(apiKey, segmentId, parsed.email);

    return new Response(htmlPage({
      title: 'Unsubscribed',
      body: 'You will no longer receive AI Glimpse Daily emails.',
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
