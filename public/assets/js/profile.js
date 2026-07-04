/**
 * profile.js — My Profile page.
 *   GET  /auth/me
 *   POST /auth/change-password
 */
(function () {
  async function init() {
    const me = await Admin.requireAuth();
    fill(me);
    document.getElementById('changePasswordForm').addEventListener('submit', changePassword);
  }

  function fill(me) {
    document.getElementById('p-fullName').textContent = me.fullName || '—';
    document.getElementById('p-username').textContent = me.username || '—';
    document.getElementById('p-email').textContent = me.email || '—';
    document.getElementById('p-mobile').textContent = me.mobile || '—';
    document.getElementById('p-role').textContent = me.usertype ? `${me.usertype.name} (${me.usertype.code})` : '—';
    document.getElementById('p-lastLogin').textContent = `${Admin.formatDate(me.lastLoginAt)} via ${me.lastLoginType || '—'}`;
  }

  async function changePassword(e) {
    e.preventDefault();
    const errBox = document.getElementById('cpErrors');
    errBox.innerHTML = '';
    const btn = document.getElementById('cpSubmit');
    Admin.setButtonLoading(btn, true, 'Updating…');
    try {
      await Admin.api.post('/auth/change-password', {
        currentPassword: document.getElementById('cp-current').value,
        newPassword: document.getElementById('cp-new').value,
      });
      Admin.toast('Password changed — please sign in again', 'success');
      setTimeout(() => { location.href = 'login.php'; }, 1200);
    } catch (err) {
      errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
        err.errors ? `<ul>${err.errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
      }</div>`;
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  }

  init();
})();
