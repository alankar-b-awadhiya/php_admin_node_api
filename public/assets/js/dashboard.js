(async function () {
  const me = await Admin.requireAuth();

  document.getElementById('welcomeHeading').textContent = `Welcome, ${me.fullName || me.username}`;

  const cards = document.querySelectorAll('#statGrid .stat-card');
  const values = [
    { label: 'Account', value: me.username, hint: me.email || me.mobile || '' },
    { label: 'Role', value: me.usertype ? me.usertype.name : '—', hint: me.usertype ? me.usertype.code : '' },
    { label: 'Last login', value: Admin.timeAgo(me.lastLoginAt), hint: Admin.formatDate(me.lastLoginAt) },
    { label: 'Login method', value: me.lastLoginType || '—', hint: me.mustChangePassword ? 'Password change required' : 'All good' },
  ];

  cards.forEach((card, i) => {
    const v = values[i];
    card.querySelector('.stat-label').textContent = v.label;
    const valueEl = card.querySelector('.stat-value');
    valueEl.classList.remove('skeleton-bar');
    valueEl.textContent = v.value;
    const hintEl = document.createElement('div');
    hintEl.className = 'stat-hint';
    hintEl.textContent = v.hint;
    card.appendChild(hintEl);
  });
})();
