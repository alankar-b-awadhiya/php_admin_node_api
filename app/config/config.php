<?php
/**
 * Central configuration for the ABA Master Admin Panel.
 *
 * This panel is a thin PHP shell: every page renders static HTML/JS and
 * ALL data operations happen client-side via fetch() calls straight to the
 * Node.js REST API (src/api/v1/...). PHP does not proxy or re-implement any
 * API logic - it only serves the UI and keeps the API base URL in one place.
 *
 * IMPORTANT (CORS + cookies):
 * The Node API sets httpOnly auth cookies (access_token / refresh_token).
 * For the browser to send/receive those cookies from JS running on this
 * PHP site, the Node API's CORS_ORIGINS env var must include this panel's
 * exact origin (scheme + host + port), and requests must use
 * credentials: 'include' (already handled in assets/js/common.js).
 */

/**
 * Minimal .env loader — no Composer/vlucas dotenv dependency, matches the
 * rest of this project's "no Composer" convention. Reads KEY=VALUE lines
 * from admin_panel/.env (repo root, one level above app/) into getenv().
 * Existing environment variables (e.g. real Apache SetEnv) always win —
 * this only fills in what isn't already set.
 */
function load_env_file(string $path): void {
    if (!is_readable($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value, " \t\"'");
        if (getenv($key) === false) {
            putenv("{$key}={$value}");
            $_ENV[$key] = $value;
        }
    }
}
load_env_file(__DIR__ . '/../../.env');

// Change this to wherever the Node app (this repo's app.js/server.js) is
// deployed, including the /api/v1 prefix.
define('API_BASE_URL', getenv('ABA_API_BASE_URL') ?: 'http://localhost:3000/api/v1');

// Cosmetic - shown in the sidebar / <title> tags.
define('APP_NAME', getenv('ABA_APP_NAME') ?: 'ABA Master Console');

// Bump this when you change assets/*.js or *.css so browsers pick up the
// new version instead of a cached copy.
define('ASSET_VERSION', '1.6.0');

// VAPID public key for Web Push subscriptions (assets/js/webpush.js "My Device"
// tab). Must match the VAPID_PUBLIC_KEY the Node API was started with —
// generate the pair once with `npx web-push generate-vapid-keys` on the API side.
define('VAPID_PUBLIC_KEY', getenv('ABA_VAPID_PUBLIC_KEY') ?: '');
