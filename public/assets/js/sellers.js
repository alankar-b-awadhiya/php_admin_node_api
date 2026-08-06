(function () {
  const base = Admin.apiBase('v2');
  const api = { get: p => Admin.api.get(p, { base }), post: (p,b) => Admin.api.post(p,b,{base}), patch: (p,b) => Admin.api.patch(p,b,{base}), del: p => Admin.api.del(p,{base}) };
  let rows = [];
  const esc = Admin.escapeHtml;
  async function load() {
    const body = document.getElementById('sellerRows'); body.innerHTML = '<tr><td colspan="7" class="table-empty">Loading sellers…</td></tr>';
    try { const r = await api.get('/sellers' + Admin.qs({ search: sellerSearch.value.trim(), status: sellerStatus.value })); rows = r.data.sellers || []; render(); }
    catch (e) { body.innerHTML = '<tr><td colspan="7" class="table-empty">Couldn’t load sellers.</td></tr>'; Admin.toastError(e); }
  }
  function render() {
    sellerCount.textContent = `${rows.length} seller${rows.length === 1 ? '' : 's'}`;
    sellerRows.innerHTML = rows.length ? rows.map(s => `<tr><td><strong>${esc(s.businessName)}</strong><div class="cell-muted">${esc(s.slug)}</div></td><td>${esc(s.email || '—')}<div class="cell-muted">${esc(s.mobile || '')}</div></td><td>${esc(s.gstin || '—')}</td><td>${s.commissionRate == null ? '—' : esc(s.commissionRate) + '%'}</td><td>${Admin.badge(s.status === 'active', s.status, s.status)}</td><td class="cell-muted">${Admin.formatDate(s.createdAt)}</td><td class="cell-actions"><button class="btn btn-secondary" data-edit="${s.sellerId}">Edit</button></td></tr>`).join('') : '<tr><td colspan="7" class="table-empty">No sellers found.</td></tr>';
    sellerRows.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => form(rows.find(s => s.sellerId === Number(b.dataset.edit))));
  }
  function form(s) {
    const edit = !!s; const val = k => esc(edit && s[k] != null ? s[k] : '');
    Admin.openModal(`<div class="modal-header"><h3>${edit ? 'Edit seller' : 'Add seller'}</h3></div><form id="sellerForm"><div class="modal-body"><div class="form-row"><div class="form-group"><label>Business name</label><input id="businessName" value="${val('businessName')}" required></div><div class="form-group"><label>Slug</label><input id="slug" value="${val('slug')}" placeholder="Generated from name when blank"></div></div><div class="form-row"><div class="form-group"><label>Email</label><input id="email" type="email" value="${val('email')}"></div><div class="form-group"><label>Mobile</label><input id="mobile" value="${val('mobile')}"></div></div><div class="form-row"><div class="form-group"><label>GSTIN</label><input id="gstin" value="${val('gstin')}"></div><div class="form-group"><label>Commission rate (%)</label><input id="commissionRate" type="number" min="0" max="100" step=".01" value="${val('commissionRate')}"></div></div><div class="form-group"><label>Address</label><textarea id="address">${val('address')}</textarea></div><div class="form-group"><label>Status</label><select id="status">${['pending','active','suspended','inactive'].map(x => `<option ${edit && s.status===x?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary">Save seller</button></div></form>`);
    modalBackdrop.querySelector('[data-close]').onclick = Admin.closeModal;
    sellerForm.onsubmit = async e => { e.preventDefault(); const data = { business_name: businessName.value.trim(), slug: slug.value.trim(), email: email.value.trim() || null, mobile: mobile.value.trim() || null, gstin: gstin.value.trim() || null, address: address.value.trim() || null, commission_rate: commissionRate.value || null, status: status.value }; try { if (edit) await api.patch('/sellers/' + s.sellerId, data); else await api.post('/sellers', data); Admin.closeModal(); Admin.toast('Seller saved', 'success'); load(); } catch (x) { Admin.toastError(x); } };
  }
  document.addEventListener('DOMContentLoaded', async () => { await Admin.requireAuth(); addSeller.onclick = () => form(); refreshSellers.onclick = load; sellerStatus.onchange = load; sellerSearch.oninput = Admin.debounce(load, 300); load(); });
})();
