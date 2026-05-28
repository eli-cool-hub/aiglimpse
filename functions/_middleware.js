// Cloudflare Pages Functions middleware. Runs on every request before the
// static asset is served. We use it to 301 www.aiglimpse.ai to the apex,
// because the _redirects file only supports path-based sources and we
// cannot install a Cloudflare Rulesets Redirect Rule from CI without
// expanding the API token scope.
//
// Docs: https://developers.cloudflare.com/pages/functions/middleware/

export const onRequest = async (context) => {
  const url = new URL(context.request.url);

  if (url.hostname === 'www.aiglimpse.ai') {
    const target = `https://aiglimpse.ai${url.pathname}${url.search}`;
    return new Response(null, {
      status: 301,
      headers: {
        location: target,
        'cache-control': 'public, max-age=3600'
      }
    });
  }

  // Basic Auth on the private dashboard and its data files. Credentials
  // live in Cloudflare Pages env vars DASHBOARD_USER and DASHBOARD_PASS
  // so the dashboard.html itself can be safely committed to the repo.
  const p = url.pathname;
  if (p === '/dashboard' || p === '/dashboard.html' || p.startsWith('/dashboard/') || p.startsWith('/data/')) {
    const user = context.env.DASHBOARD_USER;
    const pass = context.env.DASHBOARD_PASS;
    if (!user || !pass) {
      return new Response(
        'Dashboard auth is not configured yet. Open Cloudflare Pages -> aiglimpse -> Settings -> Environment variables and add DASHBOARD_USER and DASHBOARD_PASS, then redeploy.',
        { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
      );
    }
    const expected = 'Basic ' + btoa(`${user}:${pass}`);
    const got = context.request.headers.get('Authorization');
    if (got !== expected) {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="AI Glimpse Dashboard", charset="UTF-8"',
          'content-type': 'text/plain; charset=utf-8'
        }
      });
    }
  }

  return context.next();
};
