/**
 * social-inbox.js — Inbox page (maps to /social-inbox, aba_social_db
 * `social_inbox_conversations` + `social_inbox_messages`). Split view:
 * conversation list on the left, message thread + composer on the right.
 * Sending delivers to the platform via an adapter (WhatsApp only so far -
 * see socialInbox.service.js sendMessage()); a 502 from the backend means
 * the platform rejected/failed the send - handled below with a local
 * "Not delivered" bubble instead of a bare toast.
 *
 * ---------------------------------------------------------------------------
 * API map — Node API: src/domains/socialInbox/v1/socialInbox.routes.js
 * ---------------------------------------------------------------------------
 *   GET   API.list                    - list conversations (?account_id,?is_unread,?page,?per_page)
 *   GET   API.messages(conversationId)- messages in a conversation
 *   POST  API.send(conversationId)    - { message_text } send outbound
 *   PATCH API.read(conversationId)    - mark read
 */
(function () {
  const API = {
    list: '/social-inbox',
    messages: (id) => `/social-inbox/${id}/messages`,
    send: (id) => `/social-inbox/${id}/messages`,
    read: (id) => `/social-inbox/${id}/read`,
  };

  let conversations = [];
  let activeConversation = null;
  let state = { isUnread: '', page: 1, perPage: 25 };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnRefreshInbox').addEventListener('click', () => loadConversations(true));
    document.getElementById('unreadFilter').addEventListener('change', (e) => { state.isUnread = e.target.value; state.page = 1; loadConversations(); });

    await loadConversations();
  }

  async function loadConversations(spin) {
    const list = document.getElementById('conversationsList');
    const refreshBtn = document.getElementById('btnRefreshInbox');
    if (spin) refreshBtn.classList.add('is-spinning');
    list.innerHTML = `<div class="table-empty">Loading…</div>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({ is_unread: state.isUnread, page: state.page, per_page: state.perPage }));
      conversations = res.data.conversations || [];
      renderConversations();
      renderPagination(res.meta && res.meta.pagination);
      document.getElementById('conversationsCount').textContent = (res.meta && res.meta.pagination && res.meta.pagination.total) ?? conversations.length;
    } catch (err) {
      list.innerHTML = `<div class="table-empty">Couldn't load conversations.</div>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderConversations() {
    const list = document.getElementById('conversationsList');
    if (!conversations.length) {
      list.innerHTML = `<div class="table-empty">No conversations found.</div>`;
      return;
    }
    list.innerHTML = conversations.map((c) => `
      <div class="inbox-conv-item ${activeConversation && activeConversation.id === c.id ? 'is-active' : ''}" data-id="${c.id}">
        <div class="flex-gap" style="justify-content:space-between;">
          <span class="inbox-conv-name">${Admin.escapeHtml(c.participantName || 'Unknown')}</span>
          ${c.isUnread ? '<span class="badge badge-indigo"><span class="badge-dot"></span>New</span>' : ''}
        </div>
        <div class="inbox-conv-preview">${Admin.escapeHtml(c.lastMessagePreview || '')}</div>
        <div class="inbox-conv-preview" style="opacity:.7;">${Admin.timeAgo(c.lastMessageAt)}</div>
      </div>
    `).join('');

    list.querySelectorAll('.inbox-conv-item').forEach((el) => {
      el.addEventListener('click', () => {
        const c = conversations.find((x) => String(x.id) === el.dataset.id);
        openConversation(c);
      });
    });
  }

  function renderPagination(pagination) {
    const el = document.getElementById('conversationsPagination');
    if (!pagination) { el.innerHTML = ''; return; }
    const { page, pages } = pagination;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;justify-content:center;width:100%;">
        <button class="btn btn-secondary btn-sm" id="convPrev" ${page <= 1 ? 'disabled' : ''}>Prev</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="convNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('convPrev')?.addEventListener('click', () => { state.page--; loadConversations(); });
    document.getElementById('convNext')?.addEventListener('click', () => { state.page++; loadConversations(); });
  }

  async function openConversation(c) {
    activeConversation = c;
    renderConversations();

    const thread = document.getElementById('inboxThread');
    thread.innerHTML = `
      <div class="flex-gap" style="justify-content:space-between;margin-bottom:12px;">
        <strong>${Admin.escapeHtml(c.participantName || 'Unknown')}</strong>
      </div>
      <div class="inbox-messages" id="inboxMessages"><div class="table-empty">Loading…</div></div>
      <div class="inbox-composer">
        <textarea id="inboxComposerText" placeholder="Type a reply…"></textarea>
        <button class="btn btn-primary" id="btnSendMessage">Send</button>
      </div>
    `;

    document.getElementById('btnSendMessage').addEventListener('click', sendMessage);

    if (c.isUnread) {
      try { await Admin.api.patch(API.read(c.id)); c.isUnread = false; renderConversations(); } catch (err) { /* non-fatal */ }
    }

    await loadMessages(c.id);
  }

  async function loadMessages(conversationId) {
    const box = document.getElementById('inboxMessages');
    try {
      const res = await Admin.api.get(API.messages(conversationId));
      const messages = res.data.messages || [];
      if (!box) return;
      if (!messages.length) {
        box.innerHTML = `<div class="table-empty">No messages yet.</div>`;
        return;
      }
      box.innerHTML = messages.map((m) => `
        <div class="inbox-msg inbox-msg-${m.direction}">
          <div>${Admin.escapeHtml(m.messageText || '')}</div>
          <div class="inbox-msg-time">${Admin.formatDate(m.sentAt)}</div>
        </div>
      `).join('');
      box.scrollTop = box.scrollHeight;
    } catch (err) {
      if (box) box.innerHTML = `<div class="table-empty">Couldn't load messages.</div>`;
      Admin.toastError(err);
    }
  }

  async function sendMessage() {
    if (!activeConversation) return;
    const textarea = document.getElementById('inboxComposerText');
    const text = textarea.value.trim();
    if (!text) return;
    const btn = document.getElementById('btnSendMessage');
    Admin.setButtonLoading(btn, true, 'Sending…');
    try {
      await Admin.api.post(API.send(activeConversation.id), { message_text: text });
      textarea.value = '';
      await loadMessages(activeConversation.id);
      loadConversations();
    } catch (err) {
      if (err.status === 502) {
        // Platform rejected/failed the send (see socialInbox.service.js sendMessage) - no
        // message row was inserted on the backend for this case, so show a local "Not
        // delivered" bubble instead of a generic toast-only error, and leave the typed text in
        // the composer so the admin can fix/retry without retyping it.
        appendFailedMessage(text);
        Admin.toast('Not delivered — ' + (err.message || 'the platform rejected the message'), 'error', 6000);
      } else {
        Admin.toastError(err);
      }
    }
    finally { Admin.setButtonLoading(btn, false); }
  }

  /** Renders a local-only "Not delivered" bubble for a send that failed at the platform (502). */
  function appendFailedMessage(text) {
    const box = document.getElementById('inboxMessages');
    if (!box) return;
    const emptyState = box.querySelector('.table-empty');
    if (emptyState) emptyState.remove();
    const el = document.createElement('div');
    el.className = 'inbox-msg inbox-msg-outbound inbox-msg-failed';
    el.innerHTML = `
      <div>${Admin.escapeHtml(text)}</div>
      <div class="inbox-msg-time">Not delivered</div>
    `;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  init();
})();
