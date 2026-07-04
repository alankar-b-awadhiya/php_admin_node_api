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

// Change this to wherever the Node app (this repo's app.js/server.js) is
// deployed, including the /api/v1 prefix.
define('API_BASE_URL', getenv('ABA_API_BASE_URL') ?: 'http://localhost:3000/api/v1');

// Cosmetic - shown in the sidebar / <title> tags.
define('APP_NAME', 'ABA Master Console');

// Bump this when you change assets/*.js or *.css so browsers pick up the
// new version instead of a cached copy.
define('ASSET_VERSION', '1.1.0');
