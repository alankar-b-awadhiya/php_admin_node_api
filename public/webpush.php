<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Web Push Notifications';
$activeNav = 'webpush';
$pageScript = 'webpush.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Web Push Notifications</h2>
    <p class="subtitle">Manage subscriptions and send push notifications to users.</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-secondary" id="btnRefreshWebpush" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Refresh
    </button>
  </div>
</div>

<div class="tabstrip">
  <button class="tabstrip-btn" data-tab="subscribers">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1 17c0-3 2.7-5 6-5s6 2 6 5v1H1v-1Zm11.2-4c2.2.4 3.8 2 3.8 4v1h3v-1c0-2.5-2.1-4.2-4.6-4.4Z" stroke="none" fill="currentColor"/></svg>
    Subscribers
  </button>
  <button class="tabstrip-btn" data-tab="send">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M17 3 2 9.5l6 2.2M17 3l-5.2 14-3.8-6.3M17 3 8.2 11.7" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
    Send Notification
  </button>
  <button class="tabstrip-btn" data-tab="device">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M6 2h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.4"/><path d="M9 14.5h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    My Device
  </button>
</div>

<!-- ===================== Subscribers tab ===================== -->
<div class="tab-panel" id="panel-subscribers">
  <div class="stat-grid" id="wpStatGrid">
    <div class="stat-card"><div class="stat-label">Total Subscribed</div><div class="stat-value" id="statTotal">—</div><div class="stat-hint">active devices</div></div>
    <div class="stat-card"><div class="stat-label">Unique Users</div><div class="stat-value" id="statUnique">—</div><div class="stat-hint">distinct user IDs</div></div>
    <div class="stat-card"><div class="stat-label">Notifications Sent</div><div class="stat-value" id="statSent">—</div><div class="stat-hint">all-time delivered</div></div>
    <div class="stat-card"><div class="stat-label">Removed (Stale)</div><div class="stat-value" id="statRemoved">—</div><div class="stat-hint">auto-deactivated</div></div>
  </div>

  <div class="card" id="byTypeCard" style="display:none;">
    <div class="card-header">
      <div class="card-header-lead">
        <span class="card-header-icon">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M3 17V9h3v8H3Zm5.5 0V3h3v14h-3ZM14 17v-6h3v6h-3Z"/></svg>
        </span>
        <h3>By User Type</h3>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>User Type</th><th>Active</th><th>Inactive</th><th>Unique Users</th><th>Sent</th><th>Failed</th><th>Success Rate</th></tr>
        </thead>
        <tbody id="byTypeTableBody"><tr><td colspan="7" class="table-empty">Loading…</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-header-lead">
        <span class="card-header-icon">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1 17c0-3 2.7-5 6-5s6 2 6 5v1H1v-1Zm11.2-4c2.2.4 3.8 2 3.8 4v1h3v-1c0-2.5-2.1-4.2-4.6-4.4Z"/></svg>
        </span>
        <h3>Active Subscriptions</h3>
        <span style="font-size:12.5px; color:var(--text-muted); font-weight:500;">One row per browser/device</span>
      </div>
      <div class="toolbar">
        <select id="subTypeFilter" style="width:140px;"><option value="">All types</option></select>
        <input type="search" id="subUserIdFilter" placeholder="User ID…" style="width:120px;">
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>User ID</th><th>Email</th><th>User Type</th><th>Endpoint</th><th>User Agent</th>
            <th>Subscribed At</th><th>Last Updated</th><th>Status</th><th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody id="subsTableBody"><tr><td colspan="10" class="table-empty">Loading subscriptions…</td></tr></tbody>
      </table>
    </div>
    <div class="pagination" id="subsPagination"></div>
  </div>
</div>

<!-- ===================== Send Notification tab ===================== -->
<div class="tab-panel" id="panel-send">
  <div class="wp-send-grid">
    <div class="card">
      <div class="wp-compose-tabs">
        <button type="button" class="is-active" data-compose="single">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 9c-4.4 0-7 2.2-7 5v2h14v-2c0-2.8-2.6-5-7-5Z"/></svg>
          Single User
        </button>
        <button type="button" data-compose="selected">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1 17c0-3 2.7-5 6-5s6 2 6 5v1H1v-1Zm11.2-4c2.2.4 3.8 2 3.8 4v1h3v-1c0-2.5-2.1-4.2-4.6-4.4Z"/></svg>
          Selected Users
        </button>
        <button type="button" data-compose="broadcast">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M2 8.5 12 4v12L2 11.5v-3ZM13.5 6a4 4 0 0 1 0 8v-1.6a2.4 2.4 0 0 0 0-4.8V6Z"/></svg>
          Broadcast
        </button>
      </div>

      <div class="card-body">
        <!-- Single User -->
        <form class="wp-compose-form is-active" id="wpFormSingle" data-compose-panel="single">
          <div class="form-group">
            <label>User Type <span style="color:var(--coral);">*</span></label>
            <select id="singleUserType" required><option value="">Select a type…</option></select>
          </div>
          <div class="form-group">
            <label>Target User <span style="color:var(--coral);">*</span></label>
            <select id="singleTarget" required><option value="">Select a user ID…</option></select>
          </div>
          <div class="form-group">
            <label>Notification Title <span style="color:var(--coral);">*</span></label>
            <input type="text" id="singleTitle" placeholder="Enter title…" required>
          </div>
          <div class="form-group">
            <label>Message Body <span style="color:var(--coral);">*</span></label>
            <textarea id="singleBody" rows="4" placeholder="Enter message body…" required></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Icon URL <span class="opt-label">(optional)</span></label>
              <input type="text" id="singleIcon" placeholder="https://…/icon.png">
            </div>
            <div class="form-group">
              <label>Click URL <span class="opt-label">(optional)</span></label>
              <input type="text" id="singleUrl" placeholder="https://…">
            </div>
          </div>
          <div class="form-group">
            <label>Tag <span class="opt-label">(optional)</span></label>
            <input type="text" id="singleTag" placeholder="e.g. report-ready">
            <div class="field-hint">Same tag replaces previous unread</div>
          </div>
          <div class="form-group">
            <label>Require Interaction</label>
            <div class="segmented wp-toggle" data-value="false">
              <button type="button" class="is-active" data-val="false">No</button>
              <button type="button" data-val="true">Yes</button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="btnSendSingle">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M17 3 2 9.5l6 2.2M17 3l-5.2 14-3.8-6.3M17 3 8.2 11.7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            Send to User
          </button>
        </form>

        <!-- Selected Users -->
        <form class="wp-compose-form" id="wpFormSelected" data-compose-panel="selected">
          <div class="form-group">
            <label>User Type <span style="color:var(--coral);">*</span></label>
            <select id="selectedUserType" required><option value="">Select a type…</option></select>
          </div>
          <div class="form-group">
            <label>User IDs <span style="color:var(--coral);">*</span></label>
            <select id="selectedTargets" multiple size="6" required></select>
            <div class="field-hint">Hold Ctrl / Cmd to select multiple</div>
          </div>
          <div class="form-group">
            <label>Notification Title <span style="color:var(--coral);">*</span></label>
            <input type="text" id="selectedTitle" placeholder="Enter title…" required>
          </div>
          <div class="form-group">
            <label>Message Body <span style="color:var(--coral);">*</span></label>
            <textarea id="selectedBody" rows="4" placeholder="Enter message body…" required></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Icon URL <span class="opt-label">(optional)</span></label>
              <input type="text" id="selectedIcon" placeholder="https://…/icon.png">
            </div>
            <div class="form-group">
              <label>Click URL <span class="opt-label">(optional)</span></label>
              <input type="text" id="selectedUrl" placeholder="https://…">
            </div>
          </div>
          <div class="form-group">
            <label>Tag <span class="opt-label">(optional)</span></label>
            <input type="text" id="selectedTag" placeholder="e.g. report-ready">
            <div class="field-hint">Same tag replaces previous unread</div>
          </div>
          <div class="form-group">
            <label>Require Interaction</label>
            <div class="segmented wp-toggle" data-value="false">
              <button type="button" class="is-active" data-val="false">No</button>
              <button type="button" data-val="true">Yes</button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="btnSendSelected">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M17 3 2 9.5l6 2.2M17 3l-5.2 14-3.8-6.3M17 3 8.2 11.7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            Send to Selected Users
          </button>
        </form>

        <!-- Broadcast -->
        <form class="wp-compose-form" id="wpFormBroadcast" data-compose-panel="broadcast">
          <div class="callout callout-amber">
            <strong>⚠ This will push to every active subscriber.</strong> Use sparingly.
          </div>
          <div class="form-group">
            <label>Restrict to User Type <span class="opt-label">(optional)</span></label>
            <select id="broadcastUserType"><option value="">All subscribers</option></select>
          </div>
          <div class="form-group">
            <label>Notification Title <span style="color:var(--coral);">*</span></label>
            <input type="text" id="broadcastTitle" placeholder="Enter title…" required>
          </div>
          <div class="form-group">
            <label>Message Body <span style="color:var(--coral);">*</span></label>
            <textarea id="broadcastBody" rows="4" placeholder="Enter message body…" required></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Icon URL <span class="opt-label">(optional)</span></label>
              <input type="text" id="broadcastIcon" placeholder="https://…/icon.png">
            </div>
            <div class="form-group">
              <label>Click URL <span class="opt-label">(optional)</span></label>
              <input type="text" id="broadcastUrl" placeholder="https://…">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Tag <span class="opt-label">(optional)</span></label>
              <input type="text" id="broadcastTag" placeholder="e.g. report-ready">
              <div class="field-hint">Same tag replaces previous unread</div>
            </div>
            <div class="form-group">
              <label>Urgency</label>
              <select id="broadcastUrgency">
                <option value="">Normal</option>
                <option value="low">Low</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Require Interaction</label>
            <div class="segmented wp-toggle" data-value="false">
              <button type="button" class="is-active" data-val="false">No</button>
              <button type="button" data-val="true">Yes</button>
            </div>
          </div>
          <button type="submit" class="btn btn-block" id="btnSendBroadcast" style="background:var(--amber); color:#fff;">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M2 8.5 12 4v12L2 11.5v-3ZM13.5 6a4 4 0 0 1 0 8v-1.6a2.4 2.4 0 0 0 0-4.8V6Z" fill="currentColor" stroke="none"/></svg>
            Broadcast to All Subscribers
          </button>
        </form>
      </div>
    </div>

    <div class="card wp-feed-card">
      <div class="card-header">
        <div class="card-header-lead"><h3>Session Activity</h3></div>
      </div>
      <div class="card-body" id="wpFeed">
        <div class="wp-feed-empty">
          <svg width="26" height="26" viewBox="0 0 20 20" fill="none"><path d="M10 1.5a1.4 1.4 0 0 0-1.4 1.4v.6C6 4.1 4.4 6.1 4.4 8.6v3.3L2.7 14.5c-.3.5.1 1.1.7 1.1h13.2c.6 0 1-.6.7-1.1l-1.7-2.6V8.6c0-2.5-1.6-4.5-4.2-5.1v-.6A1.4 1.4 0 0 0 10 1.5Z" stroke="currentColor" stroke-width="1.3"/><path d="M3 3l14 14" stroke="currentColor" stroke-width="1.3"/></svg>
          <p>No sends yet this session</p>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ===================== My Device tab ===================== -->
<div class="tab-panel" id="panel-device">
  <div class="device-grid">
    <div class="card">
      <div class="card-header">
        <div class="card-header-lead"><h3>This Browser</h3><span style="font-size:12.5px; color:var(--text-muted); font-weight:500;">Subscribe or unsubscribe this device</span></div>
        <span class="badge badge-gray" id="deviceStatusBadge"><span class="badge-dot"></span>Checking…</span>
      </div>
      <div class="card-body">
        <div class="status-row" id="deviceStatusRow">
          <span class="status-dot"></span>
          <span id="deviceStatusText">Checking subscription status…</span>
        </div>
        <button class="btn btn-primary" id="btnDeviceToggle" type="button" style="margin-top:14px;" disabled>Subscribe</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-header-lead"><h3>Browser Permission</h3></div></div>
      <div class="card-body">
        <div class="perm-row">
          <div class="perm-row-lead">
            <span class="perm-icon" id="permIcon">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.5a1.4 1.4 0 0 0-1.4 1.4v.6C6 4.1 4.4 6.1 4.4 8.6v3.3L2.7 14.5c-.3.5.1 1.1.7 1.1h13.2c.6 0 1-.6.7-1.1l-1.7-2.6V8.6c0-2.5-1.6-4.5-4.2-5.1v-.6A1.4 1.4 0 0 0 10 1.5Zm0 17a2.2 2.2 0 0 0 2.2-2H7.8A2.2 2.2 0 0 0 10 18.5Z"/></svg>
            </span>
            <div>
              <div class="perm-title" id="permTitle">Checking…</div>
              <div class="perm-sub" id="permSub">Looking up browser permission</div>
            </div>
          </div>
          <span class="badge badge-gray" id="permBadge">—</span>
        </div>
      </div>
    </div>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
