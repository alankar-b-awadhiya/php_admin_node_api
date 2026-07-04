/**
 * login.js — wires the three tabs on login.php to the corresponding
 * /auth endpoints: /auth/login, /auth/otp/request + /auth/otp/verify,
 * /auth/login/master. On success the API sets httpOnly session cookies
 * and we redirect into the app.
 */
(function () {
  const forms = { password: 'form-password', otp: 'form-otp', master: 'form-master' };

  function redirectTarget() {
    const params = new URLSearchParams(location.search);
    const r = params.get('redirect');
    // Only allow redirecting to a same-app .php page, never an absolute/external URL.
    if (r && /^[a-zA-Z0-9_\-]+\.php(\?.*)?$/.test(r)) return r;
    return 'dashboard.php';
  }

  function showErrors(targetId, err) {
    const box = document.getElementById(targetId);
    const list = (err && err.errors && err.errors.length) ? err.errors : [err.message];
    box.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
      err.errors && err.errors.length ? `<ul>${list.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
    }</div>`;
  }
  function clearErrors(targetId) { document.getElementById(targetId).innerHTML = ''; }

  // ---- Tabs --------------------------------------------------------------
  document.querySelectorAll('#loginTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#loginTabs .tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      Object.values(forms).forEach((id) => (document.getElementById(id).style.display = 'none'));
      document.getElementById(forms[btn.dataset.tab]).style.display = 'block';
    });
  });

  // ---- Password login ------------------------------------------------
  document.getElementById('form-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors('errors-password');
    const btn = document.getElementById('pw-submit');
    Admin.setButtonLoading(btn, true, 'Signing in…');
    try {
      await Admin.api.post('/auth/login', {
        identifier: document.getElementById('pw-identifier').value.trim(),
        password: document.getElementById('pw-password').value,
      });
      Admin.toast('Signed in', 'success');
      location.href = redirectTarget();
    } catch (err) {
      showErrors('errors-password', err);
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  });

  // ---- OTP login -----------------------------------------------------
  let otpCooldownTimer = null;
  document.getElementById('otp-request-btn').addEventListener('click', async () => {
    clearErrors('errors-otp');
    const identifier = document.getElementById('otp-identifier').value.trim();
    if (!identifier) { showErrors('errors-otp', { message: 'Enter your email or mobile first' }); return; }
    const btn = document.getElementById('otp-request-btn');
    Admin.setButtonLoading(btn, true, 'Sending…');
    try {
      const res = await Admin.api.post('/auth/otp/request', { identifier });
      Admin.toast(res.message || 'OTP sent', 'success');
      document.getElementById('otp-code-group').style.display = 'block';
      document.getElementById('otp-submit').style.display = 'block';
      startOtpCooldown((res.data && res.data.resendCooldownSeconds) || 30);
    } catch (err) {
      showErrors('errors-otp', err);
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  });

  function startOtpCooldown(seconds) {
    const hint = document.getElementById('otp-resend-hint');
    const btn = document.getElementById('otp-request-btn');
    let remaining = seconds;
    btn.disabled = true;
    clearInterval(otpCooldownTimer);
    otpCooldownTimer = setInterval(() => {
      remaining -= 1;
      hint.textContent = remaining > 0 ? `You can resend the OTP in ${remaining}s` : '';
      if (remaining <= 0) { clearInterval(otpCooldownTimer); btn.disabled = false; btn.textContent = 'Resend OTP'; }
    }, 1000);
  }

  document.getElementById('form-otp').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors('errors-otp');
    const btn = document.getElementById('otp-submit');
    Admin.setButtonLoading(btn, true, 'Verifying…');
    try {
      await Admin.api.post('/auth/otp/verify', {
        identifier: document.getElementById('otp-identifier').value.trim(),
        otp: document.getElementById('otp-code').value.trim(),
      });
      Admin.toast('Signed in', 'success');
      location.href = redirectTarget();
    } catch (err) {
      showErrors('errors-otp', err);
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  });

  // ---- Master login ----------------------------------------------------
  document.getElementById('form-master').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors('errors-master');
    const btn = document.getElementById('master-submit');
    Admin.setButtonLoading(btn, true, 'Signing in…');
    try {
      await Admin.api.post('/auth/login/master', {
        identifier: document.getElementById('master-identifier').value.trim(),
        masterPassword: document.getElementById('master-password').value,
      });
      Admin.toast('Signed in with master password', 'success');
      location.href = redirectTarget();
    } catch (err) {
      showErrors('errors-master', err);
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  });

  // If already authenticated, skip straight past the login screen.
  (async () => {
    try {
      await Admin.api.get('/auth/me');
      location.href = redirectTarget();
    } catch (e) { /* not logged in — stay on this page */ }
  })();
})();
