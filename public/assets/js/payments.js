(function () {
  const base = Admin.apiBase('v2');
  const money = (n, c) => new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'INR' }).format(Number(n || 0));
  async function load() {
    paymentRows.innerHTML = '<tr><td colspan="7" class="table-empty">Loading payments…</td></tr>';
    try {
      const res = await Admin.api.get('/ecommerce/payments' + Admin.qs({ search: paymentSearch.value, per_page: 100 }), { base });
      const rows = res.data.payments || [];
      paymentCount.textContent = `${rows.length} payment${rows.length === 1 ? '' : 's'}`;
      paymentRows.innerHTML = rows.length ? rows.map((r) => `<tr><td>${Admin.escapeHtml(r.orderNumber || '—')}</td><td>${Admin.escapeHtml(r.customerName || '—')}</td><td>${money(r.amount, r.currencyCode)}</td><td>${Admin.escapeHtml(r.method || '—')}</td><td>${Admin.escapeHtml(r.reference || '—')}</td><td>${Admin.badge(r.status === 'success', r.status, r.status)}</td><td class="cell-muted">${Admin.formatDate(r.paidAt)}</td></tr>`).join('') : '<tr><td colspan="7" class="table-empty">No payment transactions found.</td></tr>';
    } catch (error) { paymentRows.innerHTML = '<tr><td colspan="7" class="table-empty">Couldn’t load payments.</td></tr>'; Admin.toastError(error); }
  }
  document.addEventListener('DOMContentLoaded', async () => { await Admin.requireAuth(); paymentRefresh.onclick = load; paymentSearch.oninput = Admin.debounce(load, 300); load(); });
})();
