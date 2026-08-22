/**
 * logs.js — System Logs page (maps to /logs.php).
 *
 * ---------------------------------------------------------------------------
 * API map — Node API: src/domains/systemLogs/v1/systemLogs.routes.js
 * ---------------------------------------------------------------------------
 *   GET   /system-logs/errors           - ?level,?from,?to,?requestId,?search,?page,?limit
 *   GET   /system-logs/api-requests     - ?statusCode,?method,?endpoint,?from,?to,?requestId,?userId,?page,?limit
 *   GET   /system-logs/auth             - ?event,?userId,?ip,?from,?to,?page,?limit
 *   GET   /system-logs/emails           - ?status,?to,?from,?to,?page,?limit
 *   GET   /system-logs/suspicious       - ?eventType,?severity,?reviewed,?ip,?userId,?from,?to,?page,?limit
 *   PATCH /system-logs/suspicious/:id/review
 *   GET   /system-logs/debug            - ?requestId,?search,?from,?to,?page,?limit
 *   GET   /system-logs/external-api     - ?provider,?success,?from,?to,?page,?limit
 *   GET   /system-logs/jobs             - ?status,?taskType,?from,?to,?page,?limit
 *   GET   /system-logs/slow-queries     - ?from,?to,?requestId,?page,?limit
 *
 * Every list endpoint returns { data: { rows: [...], pagination: { total, page, limit, totalPages } } }.
 *
 * This file is deliberately config-driven (TABS below) — one shared table/
 * filter/pagination/export engine, each tab just describes its filters,
 * columns, and how to render a detail modal. Add a new log type by adding
 * one entry to TABS, nothing else changes.
 */
(function () {
  const badgeMap = (value, map, fallbackClass = 'badge-gray') => {
    const cls = map[value] || fallbackClass;
    return `<span class="badge ${cls}"><span class="badge-dot"></span>${Admin.escapeHtml(String(value ?? '—'))}</span>`;
  };

  const truncate = (s, n = 90) => {
    if (!s) return '—';
    const str = String(s);
    return str.length > n ? Admin.escapeHtml(str.slice(0, n)) + '…' : Admin.escapeHtml(str);
  };

  function prettyJson(value) {
    if (value === null || value === undefined || value === '') return '<span class="cell-muted">—</span>';
    let parsed = value;
    if (typeof value === 'string') {
      try { parsed = JSON.parse(value); } catch (e) { return `<pre class="log-body-pre">${Admin.escapeHtml(value)}</pre>`; }
    }
    return `<pre class="log-body-pre">${Admin.escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
  }

  const LEVEL_BADGES = { debug: 'badge-gray', info: 'badge-sky', warning: 'badge-amber', error: 'badge-coral', critical: 'badge-solid-coral' };
  const SEVERITY_BADGES = { low: 'badge-gray', medium: 'badge-amber', high: 'badge-coral', critical: 'badge-solid-coral' };
  const AUTH_EVENT_BADGES = { login_success: 'badge-green', login_fail: 'badge-coral', logout: 'badge-gray', password_reset: 'badge-indigo', token_refresh: 'badge-sky' };
  const EMAIL_STATUS_BADGES = { sent: 'badge-green', failed: 'badge-coral', queued: 'badge-amber' };
  const JOB_STATUS_BADGES = { running: 'badge-amber', success: 'badge-green', failed: 'badge-coral', skipped: 'badge-gray' };

  function statusCodeBadge(code) {
    if (code === null || code === undefined) return '<span class="cell-muted">—</span>';
    const cls = code >= 500 ? 'badge-solid-coral' : code >= 400 ? 'badge-coral' : code >= 300 ? 'badge-amber' : 'badge-green';
    return `<span class="badge ${cls}"><span class="badge-dot"></span>${code}</span>`;
  }

  // ---- Shared detail-modal helper ------------------------------------------
  function openDetailModal(title, rows) {
    // rows: [{label, value(html)}]
    Admin.openModal(`
      <div class="modal-header"><h3>${Admin.escapeHtml(title)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        ${rows.map((r) => `
          <div style="margin-bottom:12px;">
            <label style="font-weight:650;font-size:13px;display:block;margin-bottom:4px;">${Admin.escapeHtml(r.label)}</label>
            ${r.value}
          </div>
        `).join('')}
      </div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-act="close">Close</button></div>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    backdrop.querySelectorAll('[data-act="view-trace"]').forEach((btn) => {
      btn.addEventListener('click', () => openTraceModal(btn.dataset.requestId));
    });
    backdrop.querySelectorAll('[data-act="view-session-tree"]').forEach((btn) => {
      btn.addEventListener('click', () => openSessionTreeModal(btn.dataset.sessionId));
    });
  }

  // Every detail() panel that shows a request_id uses this instead of a bare
  // <code> tag - adds a "View Full Trace" button next to it (see 1.3, trace
  // view). No-op button (just shows the id) when request_id is null, since
  // GET /system-logs/trace/:requestId 404s on an empty/missing id anyway.
  function requestIdBlock(requestId) {
    if (!requestId) return '<span class="cell-muted">—</span>';
    return `<code>${Admin.escapeHtml(requestId)}</code>
      <button type="button" class="btn btn-ghost btn-sm" data-act="view-trace" data-request-id="${Admin.escapeHtml(requestId)}" style="margin-left:8px;">View Full Trace →</button>`;
  }

  function sessionIdBlock(sessionId) {
    if (!sessionId) return '<span class="cell-muted">—</span>';
    return `<code>${Admin.escapeHtml(sessionId.slice(0, 8))}…</code>
      <button type="button" class="btn btn-ghost btn-sm" data-act="view-session-tree" data-session-id="${Admin.escapeHtml(sessionId)}" style="margin-left:8px;">View Session Activity →</button>`;
  }

  // ---- Request-ID trace view (1.3) -----------------------------------------
  // GET /system-logs/trace/:requestId -> { totalCount, timeline, byType }
  // timeline is every matching row across every log table, already merged
  // and sorted chronologically by the backend - this just renders it.
  const TRACE_TYPE_LABELS = {
    error: 'Error', api_request: 'API Request', auth: 'Auth', email: 'Email',
    suspicious: 'Suspicious', debug: 'Debug', external_api: 'External API', slow_query: 'Slow Query',
  };
  const TRACE_TYPE_BADGES = {
    error: 'badge-coral', api_request: 'badge-sky', auth: 'badge-indigo', email: 'badge-amber',
    suspicious: 'badge-solid-coral', debug: 'badge-gray', external_api: 'badge-green', slow_query: 'badge-amber',
  };

  function summarizeTraceRow(row) {
    switch (row.logType) {
      case 'error': return `${row.level}: ${truncate(row.message, 70)}`;
      case 'api_request': return `${Admin.escapeHtml(row.method || '')} ${truncate(row.endpoint, 45)} → ${row.response_code ?? '—'}`;
      case 'auth': return `${Admin.escapeHtml(row.event)} (user #${row.user_id ?? '—'})`;
      case 'email': return `${Admin.escapeHtml(row.status)} → ${Admin.escapeHtml(row.to_email || '—')}`;
      case 'suspicious': return `${Admin.escapeHtml(row.event_type)} (${Admin.escapeHtml(row.severity)})`;
      case 'debug': return truncate(row.message, 70);
      case 'external_api': return `${Admin.escapeHtml(row.direction)} ${Admin.escapeHtml(row.provider)} → ${row.success ? 'OK' : 'FAILED'}`;
      case 'slow_query': return `${row.execution_time_secs ?? '—'}s — ${truncate(row.query_text, 45)}`;
      default: return '—';
    }
  }

  async function openTraceModal(requestId) {
    Admin.openModal(`
      <div class="modal-header"><h3>Trace — <code>${Admin.escapeHtml(requestId)}</code></h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body" id="traceModalBody"><p class="cell-muted">Loading trace…</p></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-act="close">Close</button></div>
    `, 'modal-lg');
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    const body = document.getElementById('traceModalBody');
    try {
      const res = await Admin.api.get(`/system-logs/trace/${encodeURIComponent(requestId)}`);
      const { timeline } = res.data;
      if (!timeline.length) {
        body.innerHTML = `<p class="cell-muted">No logs found for this request.</p>`;
        return;
      }
      body.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Type</th><th>Summary</th><th>When</th></tr></thead>
            <tbody>
              ${timeline.map((row) => `
                <tr>
                  <td><span class="badge ${TRACE_TYPE_BADGES[row.logType] || 'badge-gray'}"><span class="badge-dot"></span>${TRACE_TYPE_LABELS[row.logType] || row.logType}</span></td>
                  <td class="cell-muted">${summarizeTraceRow(row)}</td>
                  <td class="cell-muted">${Admin.formatDate(row.created_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p class="cell-muted" style="margin-top:10px;">${timeline.length} total ${timeline.length === 1 ? 'entry' : 'entries'} across every log table for this request.</p>
      `;
    } catch (err) {
      body.innerHTML = `<p class="cell-muted">Couldn't load the trace for this request.</p>`;
      Admin.toastError(err);
    }
  }

  // ---- Session activity tree (whole login session, spans requests) --------
  // GET /system-logs/session-tree/:sessionId -> { session, authEvents, requests }
  // requests[] is chronological, each with .request (api_request_logs row,
  // may be null) and .children (correlated error/suspicious/debug/slow_query
  // rows sharing that request_id) - this renders the two-level tree.
  function summarizeChildRow(row) {
    switch (row.logType) {
      case 'error': return `${row.level}: ${truncate(row.message, 60)}`;
      case 'suspicious': return `${Admin.escapeHtml(row.event_type)} (${Admin.escapeHtml(row.severity)})`;
      case 'debug': return truncate(row.message, 60);
      case 'slow_query': return `${row.execution_time_secs ?? '—'}s — ${truncate(row.query_text, 40)}`;
      default: return '—';
    }
  }

  async function openSessionTreeModal(sessionId) {
    Admin.openModal(`
      <div class="modal-header"><h3>Session Activity</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body" id="sessionTreeModalBody"><p class="cell-muted">Loading session activity…</p></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-act="close">Close</button></div>
    `, 'modal-lg');
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    const body = document.getElementById('sessionTreeModalBody');
    try {
      const res = await Admin.api.get(`/system-logs/session-tree/${encodeURIComponent(sessionId)}`);
      const { session, authEvents, requests, totalRequestCount, totalLogCount } = res.data;

      const header = session
        ? `<p><strong>${Admin.escapeHtml(session.full_name || session.username)}</strong> (@${Admin.escapeHtml(session.username)}) —
           ${Admin.badge(session.active_token_count > 0, 'Active', 'Ended')}
           <span class="cell-muted"> · started ${Admin.formatDate(session.session_started_at)} · ${session.total_token_count} device(s) over this session</span></p>`
        : `<p class="cell-muted">No active-session record found (may already be fully logged out) — showing logged activity only.</p>`;

      const authRows = (authEvents || []).map((e) => `
        <tr><td>${badgeMap(e.event, AUTH_EVENT_BADGES)}</td><td class="cell-muted">${Admin.escapeHtml(e.ip_address || '—')}</td><td class="cell-muted">${Admin.formatDate(e.created_at)}</td></tr>
      `).join('');

      const requestBlocks = (requests || []).map((node) => {
        const req = node.request;
        const reqLine = req
          ? `<span class="badge-outline">${Admin.escapeHtml(req.method || '')}</span> ${truncate(req.endpoint, 55)} ${statusCodeBadge(req.response_code)} <span class="cell-muted">${req.response_time != null ? req.response_time + 'ms' : ''}</span>`
          : `<span class="cell-muted">Request not captured (api_request_logging was off) — showing correlated logs only</span>`;
        const when = req ? req.created_at : (node.children[0] && node.children[0].created_at);
        const children = node.children.length
          ? `<ul style="margin:6px 0 0 18px;padding:0;">${node.children.map((c) => `
              <li style="margin-bottom:4px;">
                <span class="badge ${TRACE_TYPE_BADGES[c.logType] || 'badge-gray'}"><span class="badge-dot"></span>${TRACE_TYPE_LABELS[c.logType] || c.logType}</span>
                <span class="cell-muted">${summarizeChildRow(c)}</span>
              </li>`).join('')}</ul>`
          : '';
        return `
          <div style="padding:10px 12px;border:1px solid var(--line-soft);border-radius:var(--radius-sm);margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;gap:10px;">
              <div>${reqLine}</div>
              <span class="cell-muted" style="white-space:nowrap;">${Admin.timeAgo(when)}</span>
            </div>
            ${children}
          </div>`;
      }).join('');

      body.innerHTML = `
        ${header}
        ${authRows ? `<div class="table-wrap" style="margin:10px 0 16px;"><table><thead><tr><th>Auth Event</th><th>IP</th><th>When</th></tr></thead><tbody>${authRows}</tbody></table></div>` : ''}
        <h4 style="margin:0 0 10px;">Requests in this session (${totalRequestCount})</h4>
        ${requestBlocks || '<p class="cell-muted">No requests recorded for this session yet.</p>'}
        <p class="cell-muted" style="margin-top:10px;">${totalLogCount} total log row(s) across this session.</p>
      `;
    } catch (err) {
      body.innerHTML = `<p class="cell-muted">Couldn't load this session's activity.</p>`;
      Admin.toastError(err);
    }
  }

  // ---- Explain Query (2.4) -------------------------------------------------
  // GET /system-logs/slow-queries/:sqId/explain -> re-runs EXPLAIN on the
  // exact recorded query+params against the same DB connection. Read-only.
  async function openExplainModal(row) {
    const sqId = row.sq_id ?? row.id;
    Admin.openModal(`
      <div class="modal-header"><h3>Explain — Slow Query #${sqId}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body" id="explainModalBody"><p class="cell-muted">Running EXPLAIN…</p></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-act="close">Close</button></div>
    `, 'modal-lg');
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    const body = document.getElementById('explainModalBody');
    try {
      const res = await Admin.api.get(`/system-logs/slow-queries/${sqId}/explain`);
      const { explain, queryText, databaseKey } = res.data;
      if (!explain || !explain.length) {
        body.innerHTML = `<p class="cell-muted">EXPLAIN returned no rows.</p>`;
        return;
      }
      const columns = Object.keys(explain[0]);
      body.innerHTML = `
        <p class="cell-muted" style="margin-bottom:10px;">Database: <code>${Admin.escapeHtml(databaseKey)}</code></p>
        <pre class="log-body-pre" style="margin-bottom:14px;">${Admin.escapeHtml(queryText || '—')}</pre>
        <div class="table-wrap">
          <table>
            <thead><tr>${columns.map((c) => `<th>${Admin.escapeHtml(c)}</th>`).join('')}</tr></thead>
            <tbody>
              ${explain.map((row) => `<tr>${columns.map((c) => `<td class="cell-muted">${Admin.escapeHtml(String(row[c] ?? '—'))}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      body.innerHTML = `<p class="cell-muted">Couldn't run EXPLAIN for this query.</p>`;
      Admin.toastError(err);
    }
  }

  // ===========================================================================
  // TAB DEFINITIONS
  // ===========================================================================
  const TABS = {
    errors: {
      label: 'Errors',
      path: '/system-logs/errors',
      bulkType: 'errors',
      filters: [
        { id: 'level', label: 'Level', type: 'select', options: ['', 'debug', 'info', 'warning', 'error', 'critical'] },
        { id: 'search', label: 'Search message', type: 'text' },
        { id: 'requestId', label: 'Request ID', type: 'text' },
      ],
      columns: ['Level', 'Message', 'File:Line', 'User', 'Request URI', 'When', ''],
      row(r) {
        return `
          <td>${badgeMap(r.level, LEVEL_BADGES)}</td>
          <td>${truncate(r.message, 70)}</td>
          <td class="cell-muted">${r.file ? Admin.escapeHtml(r.file) + ':' + (r.line ?? '?') : '—'}</td>
          <td class="cell-muted">${r.user_id ?? '—'}</td>
          <td class="cell-muted">${truncate(r.request_uri, 40)}</td>
          <td class="cell-muted">${Admin.timeAgo(r.created_at)}</td>
          <td class="cell-actions"><button class="btn btn-secondary btn-sm" data-act="view">View</button></td>
        `;
      },
      detail(r) {
        openDetailModal(`Error #${r.id}`, [
          { label: 'Message', value: `<p>${Admin.escapeHtml(r.message || '—')}</p>` },
          { label: 'Level', value: badgeMap(r.level, LEVEL_BADGES) },
          { label: 'Request ID', value: requestIdBlock(r.request_id) },
          { label: 'File', value: `<p class="cell-muted">${Admin.escapeHtml(r.file || '—')}${r.line ? ':' + r.line : ''}</p>` },
          { label: 'Request URI', value: `<p class="cell-muted">${Admin.escapeHtml(r.request_uri || '—')}</p>` },
          { label: 'Context', value: prettyJson(r.context) },
          { label: 'Stack Trace', value: r.trace ? `<pre class="log-body-pre">${Admin.escapeHtml(r.trace)}</pre>` : '<span class="cell-muted">—</span>' },
        ]);
      },
    },

    apiRequests: {
      label: 'API Requests',
      path: '/system-logs/api-requests',
      bulkType: 'api-requests',
      filters: [
        { id: 'statusCode', label: 'Status code', type: 'text', placeholder: 'e.g. 500' },
        { id: 'method', label: 'Method', type: 'select', options: ['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        { id: 'endpoint', label: 'Endpoint contains', type: 'text' },
        { id: 'requestId', label: 'Request ID', type: 'text' },
      ],
      columns: ['Method', 'Endpoint', 'Status', 'Time', 'User', 'IP', 'When', ''],
      row(r) {
        return `
          <td><span class="badge-outline">${Admin.escapeHtml(r.method || '—')}</span></td>
          <td class="cell-muted">${truncate(r.endpoint, 50)}</td>
          <td>${statusCodeBadge(r.response_code)}</td>
          <td class="cell-muted">${r.response_time != null ? r.response_time + 'ms' : '—'}</td>
          <td class="cell-muted">${r.user_id ?? '—'}</td>
          <td class="cell-muted">${Admin.escapeHtml(r.ip_address || '—')}</td>
          <td class="cell-muted">${Admin.timeAgo(r.created_at)}</td>
          <td class="cell-actions"><button class="btn btn-secondary btn-sm" data-act="view">View</button></td>
        `;
      },
      detail(r) {
        openDetailModal(`API Request #${r.id}`, [
          { label: 'Request', value: `<span class="badge-outline">${Admin.escapeHtml(r.method)}</span> ${Admin.escapeHtml(r.endpoint)}` },
          { label: 'Status / Duration', value: `${statusCodeBadge(r.response_code)} · ${r.response_time ?? '—'}ms` },
          { label: 'User / IP', value: `<p class="cell-muted">User #${r.user_id ?? '—'} · ${Admin.escapeHtml(r.ip_address || '—')}</p>` },
          { label: 'Request ID', value: requestIdBlock(r.request_id) },
          { label: 'Request Body', value: prettyJson(r.request_body) },
        ]);
      },
    },

    auth: {
      label: 'Auth',
      path: '/system-logs/auth',
      bulkType: 'auth',
      filters: [
        { id: 'event', label: 'Event', type: 'select', options: ['', 'login_success', 'login_fail', 'logout', 'password_reset', 'token_refresh'] },
        { id: 'userId', label: 'User ID', type: 'text' },
        { id: 'ip', label: 'IP address', type: 'text' },
      ],
      columns: ['Event', 'User', 'IP', 'Notes', 'When', ''],
      row(r) {
        return `
          <td>${badgeMap(r.event, AUTH_EVENT_BADGES)}</td>
          <td class="cell-muted">${Admin.escapeHtml(r.username || '—')} ${r.user_id ? '(#' + r.user_id + ')' : ''}</td>
          <td class="cell-muted">${Admin.escapeHtml(r.ip_address || '—')}</td>
          <td class="cell-muted">${truncate(r.notes, 40)}</td>
          <td class="cell-muted">${Admin.timeAgo(r.created_at)}</td>
          <td class="cell-actions"><button class="btn btn-secondary btn-sm" data-act="view">View</button></td>
        `;
      },
      detail(r) {
        openDetailModal(`Auth Event #${r.id}`, [
          { label: 'Event', value: badgeMap(r.event, AUTH_EVENT_BADGES) },
          { label: 'User', value: `<p class="cell-muted">${Admin.escapeHtml(r.username || '—')} (#${r.user_id ?? '—'})</p>` },
          { label: 'IP / User Agent', value: `<p class="cell-muted">${Admin.escapeHtml(r.ip_address || '—')}</p><p class="cell-muted">${Admin.escapeHtml(r.user_agent || '—')}</p>` },
          { label: 'Notes', value: `<p>${Admin.escapeHtml(r.notes || '—')}</p>` },
          { label: 'Request ID', value: requestIdBlock(r.request_id) },
          { label: 'Session', value: sessionIdBlock(r.session_id) },
        ]);
      },
    },

    emails: {
      label: 'Emails',
      path: '/system-logs/emails',
      bulkType: 'emails',
      filters: [
        { id: 'status', label: 'Status', type: 'select', options: ['', 'sent', 'failed', 'queued'] },
        { id: 'to', label: 'To (contains)', type: 'text', apiParam: 'toEmail' },
      ],
      columns: ['To', 'Subject', 'Template', 'Status', 'Error', 'When', ''],
      row(r) {
        return `
          <td class="cell-muted">${Admin.escapeHtml(r.to_email || '—')}</td>
          <td class="cell-muted">${truncate(r.subject, 40)}</td>
          <td class="cell-muted">${Admin.escapeHtml(r.template || '—')}</td>
          <td>${badgeMap(r.status, EMAIL_STATUS_BADGES)}</td>
          <td class="cell-muted">${truncate(r.error, 30)}</td>
          <td class="cell-muted">${Admin.timeAgo(r.created_at)}</td>
          <td class="cell-actions"><button class="btn btn-secondary btn-sm" data-act="view">View</button></td>
        `;
      },
      detail(r) {
        openDetailModal(`Email #${r.id}`, [
          { label: 'To / Subject', value: `<p>${Admin.escapeHtml(r.to_email || '—')}</p><p class="cell-muted">${Admin.escapeHtml(r.subject || '—')}</p>` },
          { label: 'Status', value: badgeMap(r.status, EMAIL_STATUS_BADGES) },
          { label: 'Template', value: `<p class="cell-muted">${Admin.escapeHtml(r.template || '—')}</p>` },
          { label: 'Error', value: r.error ? `<div class="form-errors"><strong>${Admin.escapeHtml(r.error)}</strong></div>` : '<span class="cell-muted">—</span>' },
          { label: 'Request ID', value: requestIdBlock(r.request_id) },
        ]);
      },
    },

    suspicious: {
      label: 'Suspicious Activity',
      path: '/system-logs/suspicious',
      bulkType: 'suspicious',
      filters: [
        { id: 'eventType', label: 'Event type', type: 'select', options: ['', 'failed_login_burst', 'brute_force_otp', 'account_enumeration', 'token_replay', 'invalid_token_reuse', 'session_hijack_suspected', 'permission_denied_repeated', 'rate_limit_exceeded', 'ip_blacklisted', 'sql_injection_pattern', 'xss_pattern', 'path_traversal_pattern', 'unusual_request_volume', 'geo_anomaly', 'other'] },
        { id: 'severity', label: 'Severity', type: 'select', options: ['', 'low', 'medium', 'high', 'critical'] },
        { id: 'reviewed', label: 'Reviewed', type: 'select', options: [{ v: '', l: 'All' }, { v: '0', l: 'Unreviewed' }, { v: '1', l: 'Reviewed' }] },
        { id: 'ip', label: 'IP address', type: 'text' },
      ],
      columns: ['Event', 'Severity', 'IP', 'Endpoint', 'Action', 'Reviewed', 'When', ''],
      row(r) {
        return `
          <td class="cell-muted">${Admin.escapeHtml(r.event_type)}</td>
          <td>${badgeMap(r.severity, SEVERITY_BADGES)}</td>
          <td class="cell-muted">${Admin.escapeHtml(r.ip_address || '—')}</td>
          <td class="cell-muted">${truncate(r.endpoint, 35)}</td>
          <td class="cell-muted">${Admin.escapeHtml((r.action_taken || '').replace(/_/g, ' '))}</td>
          <td>${Admin.badge(!!r.reviewed, 'Reviewed', 'Pending')}</td>
          <td class="cell-muted">${Admin.timeAgo(r.created_at)}</td>
          <td class="cell-actions">
            <button class="btn btn-secondary btn-sm" data-act="view">View</button>
            ${!r.reviewed ? `<button class="btn btn-success btn-sm" data-act="review">Mark Reviewed</button>` : ''}
          </td>
        `;
      },
      detail(r) {
        openDetailModal(`Suspicious Activity #${r.id}`, [
          { label: 'Event / Severity', value: `<p class="cell-muted">${Admin.escapeHtml(r.event_type)}</p>${badgeMap(r.severity, SEVERITY_BADGES)}` },
          { label: 'Who / Where', value: `<p class="cell-muted">User #${r.user_id ?? '—'} · ${Admin.escapeHtml(r.ip_address || '—')}</p><p class="cell-muted">${Admin.escapeHtml(r.method || '')} ${Admin.escapeHtml(r.endpoint || '—')}</p>` },
          { label: 'Action Taken', value: `<p class="cell-muted">${Admin.escapeHtml((r.action_taken || '').replace(/_/g, ' '))}</p>` },
          { label: 'Details', value: prettyJson(r.details) },
          { label: 'Review Status', value: r.reviewed ? `<p class="cell-muted">Reviewed by #${r.reviewed_by ?? '—'} on ${Admin.formatDate(r.reviewed_at)}</p>` : '<span class="cell-muted">Not yet reviewed</span>' },
          { label: 'Request ID', value: requestIdBlock(r.request_id) },
        ]);
      },
      async onAction(act, row, reload) {
        if (act !== 'review') return false;
        try {
          await Admin.api.patch(`/system-logs/suspicious/${row.id}/review`);
          Admin.toast('Marked reviewed', 'success');
          reload();
        } catch (err) { Admin.toastError(err); }
        return true;
      },
    },

    debug: {
      label: 'Debug',
      path: '/system-logs/debug',
      bulkType: 'debug',
      filters: [
        { id: 'search', label: 'Search message', type: 'text' },
        { id: 'requestId', label: 'Request ID', type: 'text' },
      ],
      columns: ['Message', 'File:Line', 'User', 'Request ID', 'When', ''],
      row(r) {
        return `
          <td>${truncate(r.message, 70)}</td>
          <td class="cell-muted">${r.file ? Admin.escapeHtml(r.file) + ':' + (r.line ?? '?') : '—'}</td>
          <td class="cell-muted">${r.user_id ?? '—'}</td>
          <td class="cell-muted"><code>${Admin.escapeHtml((r.request_id || '').slice(0, 8) || '—')}</code></td>
          <td class="cell-muted">${Admin.timeAgo(r.created_at)}</td>
          <td class="cell-actions"><button class="btn btn-secondary btn-sm" data-act="view">View</button></td>
        `;
      },
      detail(r) {
        openDetailModal(`Debug Log #${r.id}`, [
          { label: 'Message', value: `<p>${Admin.escapeHtml(r.message || '—')}</p>` },
          { label: 'File', value: `<p class="cell-muted">${Admin.escapeHtml(r.file || '—')}${r.line ? ':' + r.line : ''}</p>` },
          { label: 'Context', value: prettyJson(r.context) },
          { label: 'Request ID', value: requestIdBlock(r.request_id) },
        ]);
      },
    },

    externalApi: {
      label: 'External API',
      path: '/system-logs/external-api',
      bulkType: 'external-api',
      filters: [
        { id: 'provider', label: 'Provider', type: 'text', placeholder: 'facebook, sms_gateway…' },
        { id: 'success', label: 'Outcome', type: 'select', options: [{ v: '', l: 'All' }, { v: '1', l: 'Success' }, { v: '0', l: 'Failed' }] },
      ],
      columns: ['Direction', 'Provider', 'Endpoint', 'Status', 'Outcome', 'Duration', 'When', ''],
      row(r) {
        return `
          <td><span class="badge-outline">${Admin.escapeHtml(r.direction || '—')}</span></td>
          <td class="cell-muted">${Admin.escapeHtml(r.provider || '—')}</td>
          <td class="cell-muted">${truncate(r.endpoint, 40)}</td>
          <td>${statusCodeBadge(r.status_code)}</td>
          <td>${Admin.badge(!!r.success, 'Success', 'Failed')}</td>
          <td class="cell-muted">${r.duration_ms != null ? r.duration_ms + 'ms' : '—'}</td>
          <td class="cell-muted">${Admin.timeAgo(r.created_at)}</td>
          <td class="cell-actions"><button class="btn btn-secondary btn-sm" data-act="view">View</button></td>
        `;
      },
      detail(r) {
        openDetailModal(`External API Call #${r.id}`, [
          { label: 'Call', value: `<span class="badge-outline">${Admin.escapeHtml(r.direction)}</span> ${Admin.escapeHtml(r.provider)} — ${Admin.escapeHtml(r.method || '')} ${Admin.escapeHtml(r.endpoint || '—')}` },
          { label: 'Outcome', value: `${statusCodeBadge(r.status_code)} ${Admin.badge(!!r.success, 'Success', 'Failed')}` },
          { label: 'Error', value: r.error_message ? `<div class="form-errors"><strong>${Admin.escapeHtml(r.error_message)}</strong></div>` : '<span class="cell-muted">—</span>' },
          { label: 'Related Entity', value: `<p class="cell-muted">${Admin.escapeHtml(r.related_entity_type || '—')} #${Admin.escapeHtml(r.related_entity_id || '—')}</p>` },
          { label: 'Request ID', value: requestIdBlock(r.request_id) },
        ]);
      },
    },

    jobs: {
      label: 'Scheduled Jobs',
      path: '/system-logs/jobs',
      bulkType: 'jobs',
      filters: [
        { id: 'status', label: 'Status', type: 'select', options: ['', 'running', 'success', 'failed', 'skipped'] },
        { id: 'taskType', label: 'Task type', type: 'text' },
      ],
      columns: ['Job', 'Task Type', 'Status', 'Started', 'Duration', 'Error', ''],
      row(r) {
        return `
          <td class="cell-muted">${Admin.escapeHtml(r.job_name || '—')}</td>
          <td class="cell-muted">${Admin.escapeHtml(r.task_type || '—')}</td>
          <td>${badgeMap(r.status, JOB_STATUS_BADGES)}</td>
          <td class="cell-muted">${Admin.timeAgo(r.started_at)}</td>
          <td class="cell-muted">${r.duration_ms != null ? (r.duration_ms / 1000).toFixed(1) + 's' : '—'}</td>
          <td class="cell-muted">${truncate(r.error_message, 30)}</td>
          <td class="cell-actions"><button class="btn btn-secondary btn-sm" data-act="view">View</button></td>
        `;
      },
      detail(r) {
        openDetailModal(`Job Run — ${r.job_name || '#' + (r.run_id ?? r.id)}`, [
          { label: 'Status', value: badgeMap(r.status, JOB_STATUS_BADGES) },
          { label: 'Timing', value: `<p class="cell-muted">Started ${Admin.formatDate(r.started_at)}${r.finished_at ? ' · Finished ' + Admin.formatDate(r.finished_at) : ''}</p>` },
          { label: 'Error', value: r.error_message ? `<div class="form-errors"><strong>${Admin.escapeHtml(r.error_message)}</strong></div>` : '<span class="cell-muted">—</span>' },
          { label: 'Response Payload', value: prettyJson(r.response_payload) },
        ]);
      },
    },

    slowQueries: {
      label: 'Slow Queries',
      path: '/system-logs/slow-queries',
      bulkType: 'slow-queries',
      filters: [
        { id: 'requestId', label: 'Request ID', type: 'text' },
      ],
      columns: ['Query', 'Duration', 'Request ID', 'When', ''],
      row(r) {
        return `
          <td class="cell-muted">${truncate(r.query_text, 70)}</td>
          <td class="cell-muted">${r.execution_time_secs != null ? r.execution_time_secs + 's' : '—'}</td>
          <td class="cell-muted"><code>${Admin.escapeHtml((r.request_id || '').slice(0, 8) || '—')}</code></td>
          <td class="cell-muted">${Admin.timeAgo(r.created_at)}</td>
          <td class="cell-actions">
            <button class="btn btn-ghost btn-sm" data-act="explain">Explain</button>
            <button class="btn btn-secondary btn-sm" data-act="view">View</button>
          </td>
        `;
      },
      detail(r) {
        openDetailModal(`Slow Query #${r.sq_id ?? r.id}`, [
          { label: 'Query', value: `<pre class="log-body-pre">${Admin.escapeHtml(r.query_text || '—')}</pre>` },
          { label: 'Params', value: prettyJson(r.params) },
          { label: 'Execution Time', value: `<p>${r.execution_time_secs ?? '—'}s</p>` },
          { label: 'Request ID', value: requestIdBlock(r.request_id) },
        ]);
      },
      async onAction(act, row, reload) {
        if (act !== 'explain') return false;
        await openExplainModal(row);
        return true;
      },
    },

    sessions: {
      label: 'Sessions',
      path: '/system-logs/sessions',
      // No bulkType (that's the delete-endpoint mechanism) - sessions use
      // bulkAction instead, which calls the revoke endpoint via a custom
      // handler and drives the same checkbox/selection UI.
      bulkAction: {
        label: 'Revoke Selected',
        danger: true,
        confirmTitle: (n) => `Revoke ${n} session${n === 1 ? '' : 's'}?`,
        confirmBody: (n) => `The selected user${n === 1 ? '' : 's'} will be signed out immediately on ${n === 1 ? 'that device' : 'those devices'}. This can't be undone.`,
        async handler(jtis) {
          const res = await Admin.api.post('/system-logs/sessions/bulk-revoke', { jtis });
          Admin.toast(`Revoked ${res.data.revoked} of ${res.data.requested} session(s)`, 'success');
        },
      },
      filters: [
        { id: 'search', label: 'Search user (name/email/username)', type: 'text' },
        { id: 'userId', label: 'User ID', type: 'text' },
      ],
      columns: ['User', 'Device / IP', 'Session', 'Expires', ''],
      row(r) {
        return `
          <td>
            <div>${Admin.escapeHtml(r.full_name || r.username)}</div>
            <div class="cell-muted">@${Admin.escapeHtml(r.username)} · ${Admin.escapeHtml(r.email || '—')}</div>
          </td>
          <td class="cell-muted">${truncate(r.user_agent, 40)}<br>${Admin.escapeHtml(r.ip_address || '—')}</td>
          <td>${sessionIdBlock(r.session_id)}</td>
          <td class="cell-muted">${Admin.formatDate(r.expires_at)}</td>
          <td class="cell-actions">
            <button class="btn btn-danger btn-sm" data-act="revoke">Revoke</button>
          </td>
        `;
      },
      detail(r) {
        openDetailModal(`Session — ${r.username}`, [
          { label: 'User', value: `<p>${Admin.escapeHtml(r.full_name || r.username)} (@${Admin.escapeHtml(r.username)}) — ${Admin.escapeHtml(r.email || '—')}</p>` },
          { label: 'Device', value: `<p class="cell-muted">${Admin.escapeHtml(r.user_agent || '—')}</p><p class="cell-muted">${Admin.escapeHtml(r.ip_address || '—')}</p>` },
          { label: 'Session', value: sessionIdBlock(r.session_id) },
          { label: 'Created / Expires', value: `<p class="cell-muted">${Admin.formatDate(r.created_at)} → ${Admin.formatDate(r.expires_at)}</p>` },
        ]);
      },
      async onAction(act, row, reload) {
        if (act === 'view-session-tree') {
          await openSessionTreeModal(row.session_id);
          return true;
        }
        if (act !== 'revoke') return false;
        const ok = await Admin.confirmAction({
          title: 'Revoke this session?',
          body: `${row.full_name || row.username} will be signed out immediately on this device.`,
          confirmLabel: 'Revoke',
          danger: true,
        });
        if (!ok) return true;
        try {
          await Admin.api.del(`/system-logs/sessions/${encodeURIComponent(row.jti)}`);
          Admin.toast('Session revoked', 'success');
          reload();
        } catch (err) { Admin.toastError(err); }
        return true;
      },
    },
  };

  const TAB_ORDER = ['errors', 'apiRequests', 'auth', 'suspicious', 'emails', 'externalApi', 'jobs', 'slowQueries', 'debug', 'sessions'];

  let activeTab = 'errors';
  let filterValues = {};
  let rows = [];
  let page = 1;
  const perPage = 25;
  let lastPagination = null;
  let selectedRowIds = new Set(); // reset on tab change / reload - see 2.5 bulk delete

  async function init() {
    await Admin.requireAuth();
    document.getElementById('btnRefreshLogs').addEventListener('click', () => loadList(true));
    document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
    document.getElementById('btnBulkDelete').addEventListener('click', bulkDeleteSelected);
    renderTabs();
    renderFilterBar();
    await loadList();
  }

  function renderTabs() {
    const el = document.getElementById('logsTabs');
    el.innerHTML = TAB_ORDER.map((key) => `
      <button class="tab-btn ${key === activeTab ? 'is-active' : ''}" data-tab="${key}">${Admin.escapeHtml(TABS[key].label)}</button>
    `).join('');
    el.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        filterValues = {};
        page = 1;
        selectedRowIds = new Set();
        renderTabs();
        renderFilterBar();
        document.getElementById('logsTableTitle').textContent = TABS[activeTab].label;
        loadList();
      });
    });
    document.getElementById('logsTableTitle').textContent = TABS[activeTab].label;
  }

  function optionsHtml(opts) {
    return opts.map((o) => {
      if (typeof o === 'string') return `<option value="${Admin.escapeHtml(o)}">${o === '' ? 'All' : Admin.escapeHtml(o)}</option>`;
      return `<option value="${Admin.escapeHtml(o.v)}">${Admin.escapeHtml(o.l)}</option>`;
    }).join('');
  }

  function renderFilterBar() {
    const tab = TABS[activeTab];
    const bar = document.getElementById('logsFilterBar');
    const fields = tab.filters.map((f) => {
      const param = f.apiParam || f.id;
      if (f.type === 'select') {
        return `
          <div class="form-group" style="margin-bottom:0;min-width:150px;">
            <label for="flt_${f.id}">${Admin.escapeHtml(f.label)}</label>
            <select id="flt_${f.id}" data-filter="${param}">${optionsHtml(f.options)}</select>
          </div>`;
      }
      return `
        <div class="form-group" style="margin-bottom:0;min-width:160px;">
          <label for="flt_${f.id}">${Admin.escapeHtml(f.label)}</label>
          <input type="text" id="flt_${f.id}" data-filter="${param}" placeholder="${Admin.escapeHtml(f.placeholder || '')}">
        </div>`;
    }).join('');

    bar.innerHTML = fields + `
      <div class="form-group" style="margin-bottom:0;min-width:150px;">
        <label for="flt_from">From</label>
        <input type="date" id="flt_from" data-filter="from">
      </div>
      <div class="form-group" style="margin-bottom:0;min-width:150px;">
        <label for="flt_to">To</label>
        <input type="date" id="flt_to" data-filter="to">
      </div>
      <button class="btn btn-secondary" id="btnApplyFilters" type="button">Apply</button>
      <button class="btn btn-ghost" id="btnClearFilters" type="button">Clear</button>
    `;

    document.getElementById('btnApplyFilters').addEventListener('click', () => {
      bar.querySelectorAll('[data-filter]').forEach((el) => {
        if (el.value) filterValues[el.dataset.filter] = el.value;
        else delete filterValues[el.dataset.filter];
      });
      page = 1;
      loadList();
    });
    document.getElementById('btnClearFilters').addEventListener('click', () => {
      filterValues = {};
      page = 1;
      renderFilterBar();
      loadList();
    });
  }

  function buildQuery(extraPage, extraLimit) {
    return Admin.qs({ ...filterValues, page: extraPage ?? page, limit: extraLimit ?? perPage });
  }

  async function loadList(spin) {
    const tab = TABS[activeTab];
    const head = document.getElementById('logsTableHead');
    const body = document.getElementById('logsTableBody');
    const refreshBtn = document.getElementById('btnRefreshLogs');
    if (spin) refreshBtn.classList.add('is-spinning');

    head.innerHTML = `<tr><th style="width:34px;"><input type="checkbox" id="logsSelectAll"></th>${tab.columns.map((c) => `<th${c === '' ? ' style="text-align:right;"' : ''}>${Admin.escapeHtml(c)}</th>`).join('')}</tr>`;
    body.innerHTML = `<tr><td colspan="${tab.columns.length + 1}" class="table-empty">Loading…</td></tr>`;

    try {
      const res = await Admin.api.get(tab.path + buildQuery());
      rows = res.data.rows || [];
      lastPagination = res.data.pagination || null;
      selectedRowIds = new Set();
      renderTable();
      renderPagination();
      updateBulkDeleteButton();
      document.getElementById('logsCount').textContent = `${(lastPagination && lastPagination.total) ?? rows.length} row${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="${tab.columns.length + 1}" class="table-empty">Couldn't load logs.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function rowKey(r) {
    return r.id ?? r.run_id ?? r.sq_id ?? r.jti;
  }

  function renderTable() {
    const tab = TABS[activeTab];
    const body = document.getElementById('logsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${tab.columns.length + 1}" class="table-empty">No entries found.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((r) => `
      <tr data-key="${rowKey(r)}">
        <td><input type="checkbox" class="log-row-select" value="${rowKey(r)}" ${selectedRowIds.has(String(rowKey(r))) ? 'checked' : ''}></td>
        ${tab.row(r)}
      </tr>
    `).join('');
    body.querySelectorAll('tr').forEach((tr) => {
      const r = rows.find((x) => String(rowKey(x)) === tr.dataset.key);
      if (!r) return;
      tr.querySelector('[data-act="view"]')?.addEventListener('click', () => tab.detail(r));
      tr.querySelectorAll('[data-act]').forEach((btn) => {
        const act = btn.dataset.act;
        if (act === 'view') return;
        btn.addEventListener('click', async () => {
          if (tab.onAction) await tab.onAction(act, r, () => loadList());
        });
      });
      tr.querySelector('.log-row-select')?.addEventListener('change', (e) => {
        const key = String(e.target.value);
        if (e.target.checked) selectedRowIds.add(key); else selectedRowIds.delete(key);
        updateBulkDeleteButton();
      });
    });

    const selectAll = document.getElementById('logsSelectAll');
    if (selectAll) {
      selectAll.checked = rows.length > 0 && rows.every((r) => selectedRowIds.has(String(rowKey(r))));
      selectAll.addEventListener('change', () => {
        rows.forEach((r) => {
          const key = String(rowKey(r));
          if (selectAll.checked) selectedRowIds.add(key); else selectedRowIds.delete(key);
        });
        renderTable();
        updateBulkDeleteButton();
      });
    }
  }

  // ---- Bulk delete (2.5) / bulk action (generalized for Sessions' bulk-revoke) --
  function updateBulkDeleteButton() {
    const tab = TABS[activeTab];
    const btn = document.getElementById('btnBulkDelete');
    if (tab.bulkType) {
      btn.style.display = '';
      btn.disabled = selectedRowIds.size === 0;
      btn.textContent = `Delete selected (${selectedRowIds.size})`;
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-danger');
    } else if (tab.bulkAction) {
      btn.style.display = '';
      btn.disabled = selectedRowIds.size === 0;
      btn.textContent = `${tab.bulkAction.label} (${selectedRowIds.size})`;
      btn.classList.remove('btn-danger');
      btn.classList.add('btn-secondary');
    } else {
      btn.style.display = 'none';
    }
  }

  async function bulkDeleteSelected() {
    const tab = TABS[activeTab];
    const ids = Array.from(selectedRowIds);
    if (!ids.length) return;

    if (tab.bulkAction) {
      const ok = await Admin.confirmAction({
        title: tab.bulkAction.confirmTitle(ids.length),
        body: tab.bulkAction.confirmBody(ids.length),
        confirmLabel: tab.bulkAction.label,
        danger: !!tab.bulkAction.danger,
      });
      if (!ok) return;
      try {
        await tab.bulkAction.handler(ids);
        selectedRowIds = new Set();
        await loadList();
      } catch (err) { Admin.toastError(err); }
      return;
    }

    if (!tab.bulkType) return;
    const ok = await Admin.confirmAction({
      title: `Delete ${ids.length} log entr${ids.length === 1 ? 'y' : 'ies'}?`,
      body: `This permanently deletes the selected ${tab.label.toLowerCase()} rows. This can't be undone.`,
      confirmLabel: 'Delete selected',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await Admin.api.post(`/system-logs/${tab.bulkType}/bulk-delete`, { ids: ids.map(Number) });
      Admin.toast(`${res.data.deletedCount} row(s) deleted`, 'success');
      selectedRowIds = new Set();
      await loadList();
    } catch (err) { Admin.toastError(err); }
  }

  function renderPagination() {
    const el = document.getElementById('logsPagination');
    if (!lastPagination) { el.innerHTML = `<span>Total: ${rows.length}</span>`; return; }
    const { page: p, limit, total, totalPages } = lastPagination;
    const from = total === 0 ? 0 : (p - 1) * limit + 1;
    const to = Math.min(total, p * limit);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="logsPrev" ${p <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${p} / ${totalPages || 1}</span>
        <button class="btn btn-secondary btn-sm" id="logsNext" ${p >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('logsPrev')?.addEventListener('click', () => { page--; loadList(); });
    document.getElementById('logsNext')?.addEventListener('click', () => { page++; loadList(); });
  }

  // ---- CSV export ------------------------------------------------------
  // Fetches every matching row (following current filters), up to a safety
  // cap, then downloads as CSV — independent of what's currently on-screen.
  const EXPORT_PAGE_SIZE = 200;
  const EXPORT_MAX_ROWS = 5000;

  function csvEscape(value) {
    if (value === null || value === undefined) return '';
    let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  async function exportCsv() {
    const tab = TABS[activeTab];
    const btn = document.getElementById('btnExportCsv');
    Admin.setButtonLoading(btn, true, 'Exporting…');
    try {
      let all = [];
      let p = 1;
      let totalPages = 1;
      do {
        const res = await Admin.api.get(tab.path + buildQuery(p, EXPORT_PAGE_SIZE));
        const pageRows = res.data.rows || [];
        all = all.concat(pageRows);
        totalPages = (res.data.pagination && res.data.pagination.totalPages) || 1;
        p++;
      } while (p <= totalPages && all.length < EXPORT_MAX_ROWS);

      if (!all.length) {
        Admin.toast('Nothing to export for the current filters', 'error');
        return;
      }

      const columns = Object.keys(all[0]);
      const lines = [columns.join(',')];
      all.forEach((row) => lines.push(columns.map((c) => csvEscape(row[c])).join(',')));
      const csv = lines.join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab}-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      Admin.toast(
        all.length >= EXPORT_MAX_ROWS
          ? `Exported first ${all.length} rows (cap reached — narrow filters for more)`
          : `Exported ${all.length} rows`,
        'success'
      );
    } catch (err) {
      Admin.toastError(err);
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  }

  init();
})();
