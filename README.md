# ABA Master Console — PHP Admin Panel

A thin PHP/JS admin panel for the Node.js REST API in this project
(`src/api/v1/...`). PHP only renders page shells; every read/write goes
straight from the browser to the Node API via `fetch()`.

## Production structure

```
admin_panel/
├── public/                 ← point your web server's DocumentRoot HERE
│   ├── index.php            redirects to dashboard.php
│   ├── login.php            password / OTP / master-password sign-in
│   ├── dashboard.php        landing page (profile summary + quick links)
│   ├── users.php            Master Users            → /master-users
│   ├── usertypes.php        Usertypes               → /master-usertypes
│   ├── rbac-resources.php   RBAC resources          → /master-rbac/resources
│   ├── rbac-permissions.php RBAC permissions        → /master-rbac/permissions
│   ├── rbac-grants.php      redirects to rbac-permissions.php#matrix
│   ├── sessions.php         My active sessions      → /auth/sessions
│   ├── profile.php          My profile / change pw  → /auth/change-password
│   ├── assets/
│   │   ├── css/style.css    one shared stylesheet
│   │   └── js/              common.js (API client/auth guard) + one file per page
│   └── .htaccess            web-facing rules: HTTPS redirect, security
│                             headers, caching, no directory listing, blocks
│                             PHP execution inside assets/
│
├── app/                     ← NEVER web-accessible (lives outside public/)
│   ├── config/
│   │   └── config.php       API base URL + app settings (edit this first)
│   ├── includes/
│   │   ├── header.php
│   │   ├── sidebar.php
│   │   └── footer.php       shared layout, included by every page
│   └── .htaccess            defense-in-depth: denies all requests
│
├── .htaccess                root-level defense-in-depth: denies all requests
│                             in case the server is ever misconfigured to
│                             serve this folder instead of public/
├── .gitignore
└── README.md
```

Why this split: config and shared includes are moved outside the folder
Apache/Nginx actually serves, so a server misconfiguration can't expose
`config.php` or credentials over HTTP. Two extra `.htaccess` files (`app/`
and project root) add a second layer of protection even if the document
root is ever pointed at the wrong place.

Every protected page (`users.php`, `usertypes.php`, `rbac-*.php`,
`sessions.php`, `profile.php`, `dashboard.php`) is guarded client-side:
the page's JS calls `Admin.requireAuth()` on load, which hits `GET
/auth/me`; on 401 it redirects to `login.php`.

## 1. Configure the API base URL

Edit `app/config/config.php`:

```php
define('API_BASE_URL', 'https://your-domain.example.com/api/v1');
```

or (recommended for production) set the `ABA_API_BASE_URL` environment
variable on the PHP host — it's read automatically via `getenv()`, so you
don't need to touch the file per-environment. With Apache you can set it
in the vhost with `SetEnv ABA_API_BASE_URL "https://..."`; with PHP-FPM,
set it in the pool's `env[ABA_API_BASE_URL]`.

## 2. Point the Node API's CORS at this panel

Cookies (`access_token` / `refresh_token`) are `httpOnly` and set by the
Node API. For the browser to send them back on every `fetch()` from this
PHP panel, the Node app's `CORS_ORIGINS` env var must list this panel's
**exact origin** (scheme + host + port), e.g.:

```
CORS_ORIGINS=https://admin.your-domain.example.com
```

`app.js` already does `cors({ origin: env.corsOrigins, credentials: true })`,
so this is the only change needed on the Node side.

If the PHP panel and the Node API are served from the same origin (e.g.
Node mounted at `/api` behind the same reverse proxy as the PHP files),
none of this matters and cookies just work.

## 3. Deploy

1. Upload the whole project (both `public/` and `app/`) to the host — but
   point the web server's **DocumentRoot at `public/`**, not the project
   root. That's what actually keeps `app/config/config.php` and the
   includes off the public internet; the `.htaccess` files are a backup,
   not a substitute.
   - Apache (vhost): `DocumentRoot /var/www/admin_panel/public`
   - Shared hosting without vhost access: upload `public/`'s contents to
     `public_html/` (or your host's web root) and upload `app/` one level
     above it, so the relative `../app/...` paths in `public/*.php` still
     resolve.
2. Make sure `mod_rewrite`, `mod_headers`, `mod_expires`, and `mod_deflate`
   are enabled if you want the full benefit of `public/.htaccess` (HTTPS
   redirect, security headers, asset caching/compression). Everything
   still works without them; those blocks are wrapped in `<IfModule>`.
3. Requires PHP 7.4+, no extensions or database — PHP never talks to
   MySQL here, the Node API does.

## Notes

- `master-users`, `master-usertypes` and `master-rbac` routes require the
  signed-in account to be `SUPERADMIN` or `ADMIN` (enforced server-side by
  `requireUsertype`); delete actions require `SUPERADMIN`. The UI hides
  delete buttons for non-superadmins via `Admin.isUsertype('SUPERADMIN')`,
  but the real enforcement is always on the API.
- Creating a user without a password returns a one-time `tempPassword` —
  shown once in a modal, never persisted client-side.
- The "Role Grants" page (`rbac-grants.php`) now just redirects to the
  "Role Matrix" tab on `rbac-permissions.php`, kept around so old
  bookmarks/links don't 404.
# php_admin_node_api
