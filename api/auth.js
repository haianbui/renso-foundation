// Vercel Serverless Function — GitHub OAuth proxy for Decap CMS
// This handles the OAuth handshake between Decap CMS and GitHub
// so editors can log in with their GitHub account.
//
// Required environment variables in Vercel dashboard:
//   GITHUB_CLIENT_ID     → from your GitHub OAuth App
//   GITHUB_CLIENT_SECRET → from your GitHub OAuth App

const GITHUB_CLIENT_ID     = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const ORIGIN               = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://renso-foundation.vercel.app';

export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, ORIGIN);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');

  // ── Step 1: Redirect to GitHub to request authorization ──────────
  if (!code) {
    const params = new URLSearchParams({
      client_id:    GITHUB_CLIENT_ID,
      scope:        'repo,user',
      state:        state || crypto.randomUUID(),
      redirect_uri: `${ORIGIN}/api/auth`,
    });
    return res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
  }

  // ── Step 2: Exchange code for access token ────────────────────────
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id:     GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.status(401).send(`
        <script>
          window.opener.postMessage(
            'authorization:github:error:${JSON.stringify(tokenData.error)}',
            '*'
          );
        </script>
      `);
    }

    // ── Step 3: Post token back to Decap CMS via postMessage ─────────
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!doctype html>
      <html><body>
        <script>
          (function() {
            function receiveMessage(e) {
              window.opener.postMessage(
                'authorization:github:success:${JSON.stringify({ token: tokenData.access_token, provider: 'github' })}',
                e.origin
              );
            }
            window.addEventListener('message', receiveMessage, false);
            window.opener.postMessage('authorizing:github', '*');
          })();
        </script>
        <p>Authorizing… you can close this window.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('OAuth error:', err);
    return res.status(500).send('Authentication failed. Please try again.');
  }
}
