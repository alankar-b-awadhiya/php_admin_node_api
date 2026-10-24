/**
 * report-sources.js — API Sources page. STEP 1 STUB: confirms the auth guard, the gateway
 * route and the user's permission work, and fills the "registered" stat.
 * Replaced by the real page in Step 2.
 */
(function () {
  async function init() {
    const boot = await Reports.bootPage({ listPath: Reports.API.sources.list, noun: 'API sources', mount: 'rptMain' });
    if (!boot) return;
    document.getElementById('rptMain').innerHTML = Reports.stateHtml('empty', 'The API Sources screen arrives in Step 2.');
  }
  document.getElementById('btnRefresh').addEventListener('click', init);
  init().catch((e) => Admin.toastError(e));
})();
