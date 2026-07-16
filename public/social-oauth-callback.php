<?php
/**
 * social-oauth-callback.php
 *
 * The redirect_uri configured in each platform's developer console (and in
 * node-apis/.env as e.g. FACEBOOK_REDIRECT_URI) should point HERE, with a
 * `platform` query param baked in so this page knows which adapter to
 * complete against, e.g.:
 *
 *   https://your-admin-domain/social-oauth-callback.php?platform=facebook
 *
 * The platform's OAuth dialog appends its own `code`/`state` (or
 * `error`/`error_description`) on top of that when it redirects back, so
 * this page actually receives:
 *
 *   ?platform=facebook&code=...&state=...
 *
 * `state` is a signed token (see oauthState.js) carrying social_client_id/
 * platform/userId/redirectAfter - the session cookie isn't what authorizes
 * this call, so this page just needs to be logged in at all (requireAuth
 * still runs at the router level per socialAccounts.routes.js).
 */
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Connecting Account';
$activeNav = 'social-accounts';
$pageScript = 'social-oauth-callback.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="card" style="max-width:560px;margin:40px auto;">
  <div class="card-body" style="text-align:center;padding:40px 24px;">
    <div id="cbSpinner" class="spinner spinner-dark" style="margin:0 auto 18px;width:28px;height:28px;"></div>
    <h3 id="cbTitle">Completing connection…</h3>
    <p id="cbMessage" class="hint" style="margin-top:8px;">Please wait while we finish connecting your account.</p>
    <div id="cbActions" style="margin-top:20px;display:none;">
      <a class="btn btn-primary" href="social-accounts.php">Go to Connected Accounts</a>
    </div>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
