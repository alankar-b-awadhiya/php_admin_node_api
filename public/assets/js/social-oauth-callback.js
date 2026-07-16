/**
 * social-oauth-callback.js — pairs with social-oauth-callback.php.
 * Reads ?platform&code&state (or ?error) from the URL, calls
 * GET /social-accounts/callback/:platform to complete the connect, then
 * bounces back to social-accounts.php.
 */
(async function () {
  await Admin.requireAuth();

  const params = new URLSearchParams(location.search);
  const platform = params.get('platform');
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  const titleEl = document.getElementById('cbTitle');
  const msgEl = document.getElementById('cbMessage');
  const spinnerEl = document.getElementById('cbSpinner');
  const actionsEl = document.getElementById('cbActions');

  function finish(ok, title, message) {
    spinnerEl.style.display = 'none';
    titleEl.textContent = title;
    titleEl.style.color = ok ? 'var(--green)' : 'var(--coral)';
    msgEl.textContent = message;
    actionsEl.style.display = 'block';
  }

  if (!platform) {
    finish(false, 'Missing platform', 'This callback URL is missing the "platform" query parameter — check the redirect_uri configured for this app.');
    return;
  }
  if (error) {
    finish(false, 'Connection denied', errorDescription || error);
    return;
  }
  if (!code || !state) {
    finish(false, 'Missing parameters', 'The platform did not return the expected code/state — please try connecting again.');
    return;
  }

  try {
    const res = await Admin.api.get(`/social-accounts/callback/${encodeURIComponent(platform)}` + Admin.qs({ code, state }));
    const accounts = res.data.connectedAccounts || [];
    finish(true, 'Account connected!', `${accounts.length} account${accounts.length === 1 ? '' : 's'} connected successfully. You can close this or head back to Connected Accounts.`);
    setTimeout(() => { location.href = 'social-accounts.php'; }, 1800);
  } catch (err) {
    finish(false, 'Connection failed', err.message || 'Something went wrong completing the connection.');
  }
})();
