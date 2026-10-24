/**
 * report-widgets.js — Widgets page. STEP 1 STUB: confirms the auth guard, the gateway
 * route and the user's permission work, and fills the "registered" stat.
 * Replaced by the real page in Step 4.
 */
(function () {
  async function init() {
    const boot = await Reports.bootPage({ listPath: Reports.API.widgets.list, noun: 'widgets', mount: 'rptMain' });
    if (!boot) return;
    document.getElementById('rptMain').innerHTML = Reports.stateHtml('empty', 'The widget builder arrives in Step 4.');
  }
  document.getElementById('btnRefresh').addEventListener('click', init);
  init().catch((e) => Admin.toastError(e));
})();
