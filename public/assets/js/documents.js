(function () {
  const isInvoice = location.pathname.endsWith('invoices.php');
  const base = Admin.apiBase('v2');
  const endpoint = isInvoice ? '/ecommerce/invoices' : '/ecommerce/orders';
  const money = (n, c) => new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'INR' }).format(Number(n || 0));
  const invoicePdfUrl = (id) => Admin.apiBase('v1') + '/invoices/' + id + '/pdf';

  async function load() {
    documentRows.innerHTML = '<tr><td colspan="7" class="table-empty">Loading…</td></tr>';
    try {
      const res = await Admin.api.get(endpoint + Admin.qs({ search: documentSearch.value, status: documentStatus.value, per_page: 100 }), { base });
      const rows = res.data[isInvoice ? 'invoices' : 'orders'] || [];
      documentCount.textContent = `${res.meta?.pagination?.total ?? rows.length} ${isInvoice ? 'invoice' : 'order'}${rows.length === 1 ? '' : 's'}`;
      documentRows.innerHTML = rows.length ? rows.map((r) => isInvoice
        ? `<tr><td><strong>${Admin.escapeHtml(r.invoiceNumber)}</strong></td><td>${Admin.escapeHtml(r.customerName)}</td><td>${Admin.formatDate(r.issueDate)}<div class="cell-muted">Due ${r.dueDate || '—'}</div></td><td>${money(r.totalAmount, r.currencyCode)}</td><td>${money(r.balanceDue, r.currencyCode)}</td><td>${Admin.badge(r.status === 'paid', r.status, r.status)}</td><td class="cell-actions"><button class="btn btn-ghost" type="button" data-print="${r.invoiceId}">Print</button></td></tr>`
        : `<tr><td><strong>${Admin.escapeHtml(r.orderNumber)}</strong></td><td>${Admin.escapeHtml(r.customerName)}</td><td>${Admin.formatDate(r.placedAt)}</td><td>${money(r.grandTotal, r.currencyCode)}</td><td>${Admin.escapeHtml(r.paymentStatus)}</td><td>${Admin.badge(['completed', 'delivered'].includes(r.status), r.status, r.status)}</td><td></td></tr>`).join('')
        : '<tr><td colspan="7" class="table-empty">No records found.</td></tr>';

      if (isInvoice) {
        documentRows.querySelectorAll('[data-print]').forEach((button) => {
          button.onclick = () => {
            const id = button.dataset.print;
            window.open(invoicePdfUrl(id), '_blank');
          };
        });
      }
    } catch (error) {
      documentRows.innerHTML = '<tr><td colspan="7" class="table-empty">Couldn’t load records.</td></tr>';
      Admin.toastError(error);
    }
  }
  document.addEventListener('DOMContentLoaded', async () => { await Admin.requireAuth(); documentRefresh.onclick = load; documentStatus.onchange = load; documentSearch.oninput = Admin.debounce(load, 300); load(); });
})();
