<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Notifications';
$activeNav = 'notification';
$pageScript = 'notification.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Notification Templates</h2>
    <p class="subtitle">Manage SMS, Email &amp; Web Push templates, variables, rate limits, translations and delivery logs.</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-primary" id="btnNewTemplate">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      New Template
    </button>
  </div>
</div>

<div class="tabstrip">
  <button class="tabstrip-btn" data-tab="templates">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M3 3h14v14H3V3Zm2 3h10M5 9.5h10M5 13h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    Templates
  </button>
  <button class="tabstrip-btn" data-tab="logs">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M4 3h9l3 3v11H4V3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 9h6M7 12h6M7 15h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    Delivery Logs
  </button>
  <button class="tabstrip-btn" data-tab="send">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M17 3 2 9.5l6 2.2M17 3l-5.2 14-3.8-6.3M17 3 8.2 11.7" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
    Send Test
  </button>
</div>

<!-- ===================== Templates tab ===================== -->
<div class="tab-panel" id="panel-templates">
  <div class="card" style="margin-bottom:16px;">
    <div class="card-body" style="padding:14px 16px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
      <div class="segmented" id="typeFilterGroup">
        <button type="button" class="is-active" data-type="">All</button>
        <button type="button" data-type="SMS">SMS</button>
        <button type="button" data-type="EMAIL">Email</button>
        <button type="button" data-type="WEB_PUSH">Web Push</button>
      </div>
      <div class="search-field" style="min-width:220px;">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <input type="search" id="tmplSearch" placeholder="Search templates…">
      </div>
      <select id="tmplStatusFilter" style="width:140px;">
        <option value="">All status</option>
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </select>
      <label class="checkbox-row" style="font-size:12.5px; font-weight:600; color:var(--text-muted);">
        <input type="checkbox" id="tmplAllVersions"> Show all versions
      </label>
      <div style="flex:1;"></div>
      <button class="btn-square" id="btnRefreshTemplates" type="button" title="Refresh">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-header-lead">
        <span class="card-header-icon">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h14v14H3V3Zm2 3h10M5 9.5h10M5 13h6"/></svg>
        </span>
        <h3>Templates</h3>
      </div>
      <span class="count-pill" id="templateCount">0 templates</span>
    </div>
    <div class="card-body">
      <div class="tmpl-grid" id="templatesGrid">
        <div class="table-empty">Loading templates…</div>
      </div>
    </div>
    <div class="pagination" id="templatesPagination"></div>
  </div>
</div>

<!-- ===================== Delivery Logs tab ===================== -->
<div class="tab-panel" id="panel-logs">
  <div class="card" style="margin-bottom:16px;">
    <div class="card-body" style="padding:14px 16px; display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <div class="form-group" style="margin:0; min-width:130px;">
        <label>Type</label>
        <select id="logTypeFilter">
          <option value="">All types</option>
          <option value="SMS">SMS</option>
          <option value="EMAIL">Email</option>
          <option value="WEB_PUSH">Web Push</option>
        </select>
      </div>
      <div class="form-group" style="margin:0; min-width:130px;">
        <label>Status</label>
        <select id="logStatusFilter">
          <option value="">All status</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>
      <div class="form-group" style="margin:0; min-width:200px; flex:1;">
        <label>Recipient</label>
        <input type="search" id="logRecipientFilter" placeholder="Mobile, email or endpoint…">
      </div>
      <div class="form-group" style="margin:0;">
        <label>From date</label>
        <input type="date" id="logFromDate">
      </div>
      <div class="form-group" style="margin:0;">
        <label>To date</label>
        <input type="date" id="logToDate">
      </div>
      <button class="btn-square" id="btnRefreshLogs" type="button" title="Refresh">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-header-lead">
        <span class="card-header-icon">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3h9l3 3v11H4V3Z"/></svg>
        </span>
        <h3>Delivery Logs</h3>
      </div>
      <span class="count-pill" id="logCount">0 entries</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Type</th><th>Template</th><th>Recipient</th><th>Subject</th>
            <th>Status</th><th>Retries</th><th>Sent At</th><th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody id="logsTableBody">
          <tr><td colspan="9" class="table-empty">Loading delivery logs…</td></tr>
        </tbody>
      </table>
    </div>
    <div class="pagination" id="logsPagination"></div>
  </div>
</div>

<!-- ===================== Send Test tab ===================== -->
<div class="tab-panel" id="panel-send">
  <div class="send-grid">
    <div class="card">
      <div class="card-header">
        <div class="card-header-lead">
          <span class="card-header-icon" style="background:var(--amber-tint); color:#92600f;">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V5Z"/></svg>
          </span>
          <h3>Send Test SMS</h3>
        </div>
      </div>
      <div class="card-body">
        <form id="smsForm">
          <div class="form-group">
            <label for="smsTemplate">Template</label>
            <select id="smsTemplate" required><option value="">— Select SMS template —</option></select>
          </div>
          <div id="smsVarsContainer"></div>
          <div class="form-row">
            <div class="form-group">
              <label for="smsMobile">Mobile <span style="color:var(--coral);">*</span></label>
              <input type="text" id="smsMobile" placeholder="10-digit number" required>
            </div>
            <div class="form-group">
              <label for="smsLanguage">Language</label>
              <select id="smsLanguage"><option value="hi">Hindi (hi)</option><option value="en">English (en)</option></select>
            </div>
          </div>
          <button type="submit" class="btn btn-block" id="smsSubmitBtn" style="background:var(--amber); color:#fff;">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M17 3 2 9.5l6 2.2M17 3l-5.2 14-3.8-6.3M17 3 8.2 11.7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            Send SMS
          </button>
        </form>
        <div id="smsResult"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-header-lead">
          <span class="card-header-icon" style="background:var(--sky-tint); color:var(--sky);">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4h16v12H2V4Zm1.2 1.3L10 10l6.8-4.7"/></svg>
          </span>
          <h3>Send Test Email</h3>
        </div>
      </div>
      <div class="card-body">
        <form id="emailForm">
          <div class="form-group">
            <label for="emailTemplate">Template</label>
            <select id="emailTemplate" required><option value="">— Select Email template —</option></select>
          </div>
          <div id="emailVarsContainer"></div>
          <div class="form-row">
            <div class="form-group">
              <label for="emailAddress">Email Address <span style="color:var(--coral);">*</span></label>
              <input type="email" id="emailAddress" placeholder="recipient@example.com" required>
            </div>
            <div class="form-group">
              <label for="emailLanguage">Language</label>
              <select id="emailLanguage"><option value="hi">Hindi (hi)</option><option value="en">English (en)</option></select>
            </div>
          </div>
          <button type="submit" class="btn btn-block" id="emailSubmitBtn" style="background:var(--sky); color:#fff;">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M17 3 2 9.5l6 2.2M17 3l-5.2 14-3.8-6.3M17 3 8.2 11.7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            Send Email
          </button>
        </form>
        <div id="emailResult"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-header-lead">
          <span class="card-header-icon" style="background:var(--violet-tint); color:var(--violet);">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.5a1.4 1.4 0 0 0-1.4 1.4v.6C6 4.1 4.4 6.1 4.4 8.6v3.3L2.7 14.5c-.3.5.1 1.1.7 1.1h13.2c.6 0 1-.6.7-1.1l-1.7-2.6V8.6c0-2.5-1.6-4.5-4.2-5.1v-.6A1.4 1.4 0 0 0 10 1.5Zm0 17a2.2 2.2 0 0 0 2.2-2H7.8A2.2 2.2 0 0 0 10 18.5Z"/></svg>
          </span>
          <h3>Send Test Web Push</h3>
        </div>
      </div>
      <div class="card-body">
        <div class="callout callout-amber" style="margin-bottom:0;">
          The API only exposes <code>/notification/send-sms</code> and <code>/notification/send-email</code> right now —
          there's no <code>send-web-push</code> route yet. Web Push templates can still be created and edited from the
          Templates tab; once a send endpoint is added server-side, this card is ready to wire up.
        </div>
      </div>
    </div>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
