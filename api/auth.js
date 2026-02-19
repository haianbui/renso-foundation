// Vercel Serverless Function — GitHub OAuth proxy for Decap CMS
// Required environment variables in Vercel dashboard:
//   GITHUB_CLIENT_ID     → from your GitHub OAuth App
//   GITHUB_CLIENT_SECRET → from your GitHub OAuth App
//   PRODUCTION_URL       → https://renso-foundation.vercel.app (set this manually)

const GITHUB_CLIENT_ID     = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// Always use the fixed production URL — never the per-deployment VERCEL_URL
// because that changes each deploy and won't match the GitHub OAuth callback.
const ORIGIN = process.env.PRODUCTION_URL || 'https://renso-foundation.vercel.app';

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;

  const url = new URL(req.url, baseUrl);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // Always use the fixed ORIGIN for redirect_uri so it matches GitHub OAuth App settings
  const CALLBACK = `${ORIGIN}/api/auth`;

  // ── Step 1: Redirect to GitHub ──────────────────────────────────
  if (!code) {
    const params = new URLSearchParams({
      client_id:    GITHUB_CLIENT_ID,
      scope:        'repo,user',
      redirect_uri: CALLBACK,
    });
    if (state) params.set('state', state);
    return res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
  }

  // ── Step 2: Exchange code for access token ──────────────────────
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id:     GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:  CALLBACK,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(401).send(`
        <!doctype html><html><body><script>
          window.opener && window.opener.postMessage(
            'authorization:github:error:' + JSON.stringify("${tokenData.error_description || tokenData.error}"),
            '*'
          );
          window.close();
        </script><p>Auth error: ${tokenData.error_description || tokenData.error}</p></body></html>
      `);
    }

    // ── Step 3: Return token to Decap CMS via postMessage ───────────
    const token = tokenData.access_token;
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!doctype html><html><body><script>
        (function() {
          const token = ${JSON.stringify(token)};
          const msg = 'authorization:github:success:' + JSON.stringify({ token, provider: 'github' });
          function receiveMessage(e) {
            window.opener.postMessage(msg, e.origin);
          }
          window.addEventListener('message', receiveMessage, false);
          window.opener && window.opener.postMessage('authorizing:github', '*');
        })();
      </script><p>Authorizing… you may close this window.</p></body></html>
    `);
  } catch (err) {
    console.error('OAuth error:', err);
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(`
      <!doctype html><html><body><p>Authentication failed: ${err.message}</p></body></html>
    `);
  }
}
