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
  return context.next();
};
