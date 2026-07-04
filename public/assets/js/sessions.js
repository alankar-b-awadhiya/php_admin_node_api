/**
 * sessions.js — My Sessions page.
 *   GET    /auth/sessions
 *   DELETE /auth/sessions/:jti
 *   POST   /auth/logout-all
 */
(function () {
  async function init() {
    await Admin.requireAuth();
    document.getElementById('btnLogoutAll').addEventListener('click', logoutAll);
    await load();
  }

  async function load() {
    const body = document.getElementById('sessionsTableBody');
    body.innerHTML = `<tr><td colspan="5" class="table-empty">Loading sessions…</td></tr>`;
    try {
      const res = await Admin.api.get('/auth/sessions');
      render(res.data);
    } catch (err) {
      body.innerHTML = `<tr><td colspan="5" class="table-empty">Couldn't load sessions.</td></tr>`;
      Admin.toastError(err);
    }
  }

  function render(rows) {
    const body = document.getElementById('sessionsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="table-empty">No active sessions.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((s) => `
      <tr data-jti="${Admin.escapeHtml(s.jti)}">
        <td>${Admin.escapeHtml(s.userAgent || 'Unknown device')}</td>
        <td class="cell-muted mono">${Admin.escapeHtml(s.ipAddress || '—')}</td>
        <td class="cell-muted">${Admin.formatDate(s.createdAt)}</td>
        <td class="cell-muted">${Admin.formatDate(s.expiresAt)}</td>
        <td class="cell-actions"><button class="btn btn-danger btn-sm" data-act="revoke">Revoke</button></td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      tr.querySelector('[data-act="revoke"]')?.addEventListener('click', () => revoke(tr.dataset.jti));
    });
  }

  async function revoke(jti) {
    const ok = await Admin.confirmAction({
      title: 'Revoke session?',
      body: 'That device will be signed out immediately.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(`/auth/sessions/${encodeURIComponent(jti)}`);
      Admin.toast('Session revoked', 'success');
      load();
    } catch (err) { Admin.toastError(err); }
  }

  async function logoutAll() {
    const ok = await Admin.confirmAction({
      title: 'Sign out everywhere?',
      body: 'This revokes every active session, including this one — you will be redirected to sign in again.',
      confirmLabel: 'Sign out everywhere',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.post('/auth/logout-all');
      Admin.toast('Signed out everywhere', 'success');
      location.href = 'login.php';
    } catch (err) { Admin.toastError(err); }
  }

  init();
})();
