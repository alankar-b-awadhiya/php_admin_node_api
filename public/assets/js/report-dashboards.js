/**
 * report-dashboards.js — Dashboards page. STEP 1 STUB: confirms the auth guard, the gateway
 * route and the user's permission work, and fills the "registered" stat.
 * Replaced by the real page in Step 6.
 */
(function () {
  async function init() {
    const boot = await Reports.bootPage({ listPath: Reports.API.dashboards.list, noun: 'dashboards', mount: 'rptMain' });
    if (!boot) return;
    document.getElementById('rptMain').innerHTML = Reports.stateHtml('empty', 'The dashboard viewer and builder arrive in Step 6.');
  }
  document.getElementById('btnRefresh').addEventListener('click', init);
  init().catch((e) => Admin.toastError(e));
})();
