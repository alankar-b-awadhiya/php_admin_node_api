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
## Reports (API sources → widgets → dashboards)

The **Reports** sidebar group has three pages. They talk to the `ms_reports` service through the gateway
(`/api/v1/report-sources`, `/report-widgets`, `/report-dashboards`); every URL lives in one place:
`assets/js/reports-common.js` → `Reports.API`.

| Page | File | What it does |
|---|---|---|
| API Sources | `report-sources.php` + `js/report-sources.js` | Register an internal or external API (URL, method, auth, response path, params/headers JSON, cache). **Test API** previews rows and detects fields. The detail view holds the params editor, the field catalogue (type + dimension/measure role), cache clear and the run log. Saved credentials are never shown again — only "set". |
| Widgets | `report-widgets.php` + `js/report-widgets.js` | Pick a source and a chart type (line, area, bar, stacked bar, pie, donut, KPI, table; scatter and gauge are "coming soon"). Mapping slots change with the chart type. A live preview (`POST /report-widgets/preview`) shows the chart before you save. |
| Dashboards | `report-dashboards.php` + `js/report-dashboards.js`, `js/report-dashboard-builder.js` | List, viewer and layout builder (below). |

Shared pieces: `js/reports-render.js` (`ReportsRender.renderWidget(el, payload, opts)` — one renderer for the widget
builder, the viewer, the builder preview and the home card; handles loading / error / empty / forbidden states),
`vendor/chart.umd.js` (Chart.js, served locally — no CDN), and the `.rpt-*` rules at the end of `css/style.css`.
Chart colors come from the theme panel's CSS variables and redraw when the theme changes.

### Dashboards

- **Viewer** — `report-dashboards.php?_d=<code>`. One `GET /report-dashboards/:code/data` call paints every widget; one
  failing widget only turns its own frame into an error state. Filter values live in the URL, so links can be shared.
  Cascading filters clear their children and re-fetch their options. "Refresh data" sends `?refresh=1` (cache bypass);
  auto-refresh does not, and pauses while the tab is hidden.
- **Builder** — `report-dashboards.php?_d=<code>&edit=1` (list → Layout, or viewer → Edit layout). No drag-drop: each
  placement has width, height and an order; `grid_x` / `grid_y` are derived by auto-flow (fill left to right, wrap to a
  new row). Filters (key, label, type, default, required, parent, fixed options or an options source) and per-widget
  param bindings (`@filter_key` or a fixed value) are edited here. Save is **one** `PATCH /report-dashboards/:id`
  carrying `grid_columns`, `filters[]` and `widgets[]`, which the API writes in a single transaction. A **Preview**
  panel embeds the real viewer (`&embed=1`, no sidebar / top bar) and shows the *saved* version.
- **Pinned dashboard** — "Pin to home" in the viewer (or the chooser on `dashboard.php`) shows that dashboard as a card
  on the home page. The pin is remembered **in this browser only** (`localStorage`); nothing is stored on the server.
  The card stays hidden for users who cannot list dashboards.

### Widget chart options

Stored in the widget's free-form `options` JSON (no API change). Set them in the widget builder under
*Display & limits*:

| Option | Applies to | Meaning |
|---|---|---|
| `legend` | line, area, bar, stacked bar, pie, donut | `top` / `bottom` / `right` / `none` |
| `smooth`, `horizontal` | line / area / bar; bar / stacked bar | smooth curves; sideways bars |
| `xTitle`, `yTitle` | cartesian | titles of the category and the value axis |
| `yMin`, `yMax` | cartesian | bounds of the value axis (a set `yMin` stops forcing zero) |
| `dataLabels` | cartesian, pie, donut | print values on bars, points and slices (off above 60 points) |
| `height` | cartesian, pie, donut | fixed chart height, 120–1200 px |
| `sliceColors`, `palette` | pie, donut | `{ "North": "#1a9c6b" }` by label; `["#e5484d", …]` in slice order |

### Permissions (RBAC) in the UI

The API enforces `requirePermission('report-sources' | 'report-widgets' | 'report-dashboards', view|create|edit|delete)`
on every route. The UI only **hides** buttons the user could not use, through `Reports.access.apply(resource)`, which sets
`rpt-no-create` / `rpt-no-edit` / `rpt-no-delete` on `<html>`; `style.css` hides the matching actions
(New, Edit, Layout, on/off, Test, Save params/fields, Clear cache, Delete).

- `SUPERADMIN` sees everything (the API bypasses grants for it too).
- Other users: the grants come from **`GET /auth/my-permissions`** (added to `ms_master`, see the backend patch). The
  existing `/master-rbac/.../effective-permissions` route is ADMIN/SUPERADMIN-only, so it cannot be used for this.
- If `/auth/my-permissions` is missing or fails, the UI **fails open** (buttons stay visible) and the API still answers
  403. Deploy the endpoint to get the hiding.
- The "Extra permission resource" on a widget / dashboard adds a second `view` check at runtime; it is not a UI setting.

Grants are managed on the Role Matrix page; the three resources are created by `database/reports_rbac_seed.sql` in the API repo.

### Reports changelog (files)

`report-sources.php/.js`, `report-widgets.php/.js`, `report-dashboards.php/.js`, `report-dashboard-builder.js`,
`reports-common.js`, `reports-render.js`, `dashboard.php` + `dashboard.js` + `dashboard-pinned.js`, `vendor/chart.umd.js`
(+ `chart.LICENSE.md`), `css/style.css` (`.rpt-*` block at the end), `sidebar.php` (Reports group). Bump `ASSET_VERSION`
in `app/config/config.php` whenever you change one of them.


# php_admin_node_api
