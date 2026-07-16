<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Inbox';
$activeNav = 'social-inbox';
$pageScript = 'social-inbox.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Inbox</h2>
    <p class="subtitle">DMs across every connected account, in one place</p>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group" style="margin-bottom:0;">
      <label for="unreadFilter">Show</label>
      <select id="unreadFilter">
        <option value="">All conversations</option>
        <option value="1">Unread only</option>
      </select>
    </div>
    <button class="btn-square" id="btnRefreshInbox" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</div>

<div class="card">
  <div class="inbox-layout">
    <div class="inbox-conversations">
      <div class="card-header">
        <div class="card-header-lead"><h3>Conversations</h3></div>
        <span class="count-pill" id="conversationsCount">0</span>
      </div>
      <div id="conversationsList" class="inbox-list">
        <div class="table-empty">Loading…</div>
      </div>
      <div class="pagination" id="conversationsPagination"></div>
    </div>
    <div class="inbox-thread" id="inboxThread">
      <div class="table-empty" style="padding:60px 20px;">Select a conversation to view messages.</div>
    </div>
  </div>
</div>

<style>
  .inbox-layout { display: flex; min-height: 520px; }
  .inbox-conversations { width: 320px; border-right: 1px solid var(--line); display: flex; flex-direction: column; }
  .inbox-list { flex: 1; overflow-y: auto; max-height: 560px; }
  .inbox-conv-item { padding: 12px 16px; border-bottom: 1px solid var(--line); cursor: pointer; display: block; }
  .inbox-conv-item:hover { background: var(--porcelain); }
  .inbox-conv-item.is-active { background: var(--indigo-tint); }
  .inbox-conv-name { font-weight: 650; font-size: 13.5px; }
  .inbox-conv-preview { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .inbox-thread { flex: 1; display: flex; flex-direction: column; padding: 16px; }
  .inbox-messages { flex: 1; overflow-y: auto; max-height: 460px; display: flex; flex-direction: column; gap: 10px; padding: 4px; }
  .inbox-msg { max-width: 70%; padding: 8px 12px; border-radius: 12px; font-size: 13.5px; }
  .inbox-msg-inbound { align-self: flex-start; background: var(--porcelain); }
  .inbox-msg-outbound { align-self: flex-end; background: var(--indigo-tint); color: var(--indigo-dark); }
  .inbox-msg-time { font-size: 10.5px; color: var(--text-muted); margin-top: 3px; }
  .inbox-composer { display: flex; gap: 8px; margin-top: 12px; }
  .inbox-composer textarea { flex: 1; min-height: 44px; resize: none; }
</style>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
