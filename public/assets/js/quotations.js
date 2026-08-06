(function () {
  const base = Admin.apiBase('v1');
  const api = {
    get: (path) => Admin.api.get(path, { base }),
    post: (path, body) => Admin.api.post(path, body, { base }),
    patch: (path, body) => Admin.api.patch(path, body, { base }),
  };

  let quotations = [];
  const esc = Admin.escapeHtml;

  const money = (value, currency) => value === null || value === undefined ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR' }).format(Number(value));

  async function load() {
    quotationRows.innerHTML = '<tr><td colspan="6" class="table-empty">Loading quotations…</td></tr>';
    try {
      const response = await api.get('/quotations' + Admin.qs({
        search: quotationSearch.value.trim(),
        status: quotationStatus.value,
        per_page: 100,
      }));

      quotations = response.data.quotations || [];
      render();
    } catch (error) {
      quotationRows.innerHTML = '<tr><td colspan="6" class="table-empty">Couldn’t load quotations.</td></tr>';
      Admin.toastError(error);
    }
  }

  function render() {
    quotationCount.textContent = `${quotations.length} quotation${quotations.length === 1 ? '' : 's'}`;
    quotationRows.innerHTML = quotations.length ? quotations.map((q) => `<tr>
      <td><strong>${esc(q.quotationNumber)}</strong></td>
      <td>${esc(q.customerName || '—')}</td>
      <td>${esc(q.validUntil || '—')}</td>
      <td>${money(q.totalAmount, q.currencyCode)}</td>
      <td>${Admin.badge(q.status === 'accepted', q.status, q.status)}</td>
      <td class="cell-actions"><button class="btn btn-ghost" data-pdf="${q.quotationId}">PDF</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="table-empty">No quotations found.</td></tr>';

    quotationRows.querySelectorAll('[data-pdf]').forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.pdf;
        window.open(Admin.apiBase('v1') + `/quotations/${id}/pdf`, '_blank');
      };
    });
  }

  function openRequestForm() {
    Admin.openModal(`<div class="modal-header"><h3>New quotation request</h3></div><form id="quotationForm"><div class="modal-body"><div class="form-row"><div class="form-group"><label>Customer name</label><input id="customerName" required></div><div class="form-group"><label>Customer email</label><input id="customerEmail" type="email"></div></div><div class="form-row"><div class="form-group"><label>Customer phone</label><input id="customerPhone"></div><div class="form-group"><label>Valid until</label><input id="validUntil" type="date"></div></div><div class="form-group"><label>Customer address</label><textarea id="customerAddress"></textarea></div><div class="form-group"><label>Notes</label><textarea id="notes"></textarea></div></div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-close>Cancel</button><button class="btn btn-primary">Submit request</button></div></form>`);

    modalBackdrop.querySelector('[data-close]').onclick = Admin.closeModal;
    quotationForm.onsubmit = async (event) => {
      event.preventDefault();

      try {
        await api.post('/quotations/request', {
          customer: {
            name: customerName.value.trim(),
            email: customerEmail.value.trim() || null,
            phone: customerPhone.value.trim() || null,
            address: customerAddress.value.trim() || null,
          },
          customer_note: notes.value.trim() || null,
        });

        Admin.closeModal();
        Admin.toast('Quotation request submitted', 'success');
        load();
      } catch (error) {
        Admin.toastError(error);
      }
    };
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await Admin.requireAuth();
    addQuotation.onclick = openRequestForm;
    quotationRefresh.onclick = load;
    quotationStatus.onchange = load;
    quotationSearch.oninput = Admin.debounce(load, 300);
    load();
  });
})();