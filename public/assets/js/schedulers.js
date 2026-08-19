/**
 * schedulers.js — Scheduled Tasks page (maps to /schedulers).
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY; nothing
 * else in this file should hardcode a URL. Keep this in sync with:
 *   Node API: src/api/v1/index.js, src/domains/schedulers/v1/schedulers.routes.js
 * ---------------------------------------------------------------------------
 *
 * Task types (registry):
 *   GET    API.taskTypes                 - list active task types
 *   POST   API.taskTypes                 - register/update a task type (upsert on task_type_key)
 *
 * Scheduled jobs:
 *   GET    API.list                      - list jobs (?task_type, ?is_active, ?limit, ?offset)
 *   POST   API.list                      - create a job
 *   GET    API.getOne(id)                - single job
 *   PATCH  API.update(id)                - update a job's schedule/definition
 *   DELETE API.remove(id)                - delete a job
 *   PATCH  API.pause(id)                 - turn a job off
 *   PATCH  API.resume(id)                - turn a job on
 *   GET    API.runs(id)                  - run history for a job (?limit, ?offset)
 *
 * Note: task types come back as raw DB rows (task_type_key, label,
 * description, is_active) - unlike jobs, the service layer doesn't format()
 * them to camelCase yet. Handled accordingly below.
 */
(function () {
  const API = {
    taskTypes: '/schedulers/task-types',
    list: '/schedulers',
    getOne: (id) => `/schedulers/${id}`,
    update: (id) => `/schedulers/${id}`,
    remove: (id) => `/schedulers/${id}`,
    pause: (id) => `/schedulers/${id}/pause`,
    resume: (id) => `/schedulers/${id}/resume`,
    runs: (id) => `/schedulers/${id}/runs`,
  };

  const ICON = {
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    history: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 5.5V10l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10a6 6 0 1 1 1.8 4.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4 14v-3.5h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pause: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="6" y="4.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="11" y="4.5" width="3" height="11" rx="1" fill="currentColor"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M6 4.5v11l9-5.5-9-5.5Z" fill="currentColor"/></svg>',
  };

  let taskTypes = [];   // raw rows: { task_type_key, label, description, is_active, config_schema }
  let jobs = [];         // formatted rows: { jobId, jobName, taskType, ... }
  let state = { taskType: '', isActive: '', limit: 50 };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnNewTaskType').addEventListener('click', openTaskTypeModal);
    document.getElementById('btnRefreshTaskTypes').addEventListener('click', () => loadTaskTypes(true));
    document.getElementById('btnNewTask').addEventListener('click', openAddTaskModal);
    document.getElementById('btnRefreshTasks').addEventListener('click', () => loadTasks(true));
    document.getElementById('btnApplyFilter').addEventListener('click', () => {
      state.taskType = document.getElementById('taskTypeFilter').value;
      state.isActive = document.getElementById('activeFilter').value;
      state.limit = Number(document.getElementById('limitSelect').value);
      loadTasks();
    });

    await loadTaskTypes();
    await loadTasks();
  }

  // =========================================================================
  // TASK TYPES
  // =========================================================================

  async function loadTaskTypes(spin) {
    const body = document.getElementById('taskTypesTableBody');
    const refreshBtn = document.getElementById('btnRefreshTaskTypes');
    if (spin) refreshBtn.classList.add('is-spinning');
    try {
      const res = await Admin.api.get(API.taskTypes);
      taskTypes = res.data.taskTypes || [];
      renderTaskTypesTable();
      populateTaskTypeSelects();
    } catch (err) {
      body.innerHTML = `<tr><td colspan="5" class="table-empty">Couldn't load task types.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTaskTypesTable() {
    const body = document.getElementById('taskTypesTableBody');
    if (!taskTypes.length) {
      body.innerHTML = `<tr><td colspan="5" class="table-empty">No task types yet. Click "New Task Type" to create one.</td></tr>`;
      return;
    }
    body.innerHTML = taskTypes.map((t) => `
      <tr data-key="${Admin.escapeHtml(t.task_type_key)}">
        <td class="mono-cell">${Admin.escapeHtml(t.task_type_key)}</td>
        <td><strong>${Admin.escapeHtml(t.label)}</strong></td>
        <td class="cell-muted">${Admin.escapeHtml(t.description || '—')}</td>
        <td>${Admin.badge(!!t.is_active, 'Enabled', 'Disabled')}</td>
        <td class="cell-actions">
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const t = taskTypes.find((x) => x.task_type_key === tr.dataset.key);
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openTaskTypeModal(t));
    });
  }

  function populateTaskTypeSelects() {
    const filterOpts = `<option value="">All types</option>` +
      taskTypes.map((t) => `<option value="${Admin.escapeHtml(t.task_type_key)}">${Admin.escapeHtml(t.label)}</option>`).join('');
    document.getElementById('taskTypeFilter').innerHTML = filterOpts;

    const formOpts = taskTypes.length
      ? taskTypes.map((t) => `<option value="${Admin.escapeHtml(t.task_type_key)}">${Admin.escapeHtml(t.label)}</option>`).join('')
      : `<option value="">No task types yet — create one first</option>`;
    document.querySelectorAll('.task-type-select').forEach((sel) => { sel.innerHTML = formOpts; });
  }

  function taskTypeFormHtml(t) {
    const isEdit = !!t;
    const cfg = isEdit && t.config_schema ? safeStringify(t.config_schema) : '';
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit Task Type' : 'Add a Task Type'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="taskTypeForm">
        <div class="modal-body">
          <div id="taskTypeFormErrors"></div>
          <div class="form-group">
            <label for="tt-key">Key <span style="color:var(--coral);">*</span></label>
            <input type="text" id="tt-key" placeholder="e.g. send_reminder_email" value="${isEdit ? Admin.escapeHtml(t.task_type_key) : ''}" ${isEdit ? 'readonly' : ''} required>
            <div class="field-hint">No spaces — used internally to identify this type. ${isEdit ? "Saving here updates the existing type (the key can't change)." : ''}</div>
          </div>
          <div class="form-group">
            <label for="tt-label">Label <span style="color:var(--coral);">*</span></label>
            <input type="text" id="tt-label" placeholder="e.g. Send Reminder Email" value="${isEdit ? Admin.escapeHtml(t.label) : ''}" required>
          </div>
          <div class="form-group">
            <label for="tt-description">Description</label>
            <input type="text" id="tt-description" placeholder="Optional" value="${isEdit ? Admin.escapeHtml(t.description || '') : ''}">
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:10px;">
            <label class="switch"><input type="checkbox" id="tt-active" ${!isEdit || t.is_active ? 'checked' : ''}><span class="slider"></span></label>
            <label style="margin:0;" for="tt-active">Enabled</label>
          </div>
          <div class="form-group">
            <label for="tt-configSchema">Config Schema (optional)</label>
            <textarea id="tt-configSchema" rows="4" style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12.5px;" placeholder='{ "url": "string", "method": "string" }'>${Admin.escapeHtml(cfg)}</textarea>
            <div class="field-hint" id="tt-configSchemaHint">Leave blank if this type needs no extra field definitions.</div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="taskTypeFormSubmit">Save Task Type</button>
        </div>
      </form>
    `;
  }

  function openTaskTypeModal(t) {
    Admin.openModal(taskTypeFormHtml(t || null));
    wireJsonValidation('tt-configSchema', 'tt-configSchemaHint', 'Leave blank if this type needs no extra field definitions.');
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#taskTypeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('taskTypeFormErrors');
      errBox.innerHTML = '';

      const cfg = readJson('tt-configSchema');
      if (!cfg.ok) { Admin.toast('Fix the JSON in Config Schema before saving', 'error'); return; }

      const btn = document.getElementById('taskTypeFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');
      const payload = {
        task_type_key: document.getElementById('tt-key').value.trim(),
        label: document.getElementById('tt-label').value.trim(),
        description: document.getElementById('tt-description').value.trim() || undefined,
        config_schema: cfg.value,
        is_active: document.getElementById('tt-active').checked ? 1 : 0,
      };
      try {
        await Admin.api.post(API.taskTypes, payload);
        Admin.toast(t ? 'Task type updated' : 'Task type created', 'success');
        Admin.closeModal();
        loadTaskTypes(true);
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong></div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  // =========================================================================
  // SCHEDULED TASKS
  // =========================================================================

  function jobStatusBadge(status) {
    const cls = { pending: 'badge-amber', running: 'badge-indigo', success: 'badge-green', failed: 'badge-coral', skipped: 'badge-gray', cancelled: 'badge-gray' }[status] || 'badge-gray';
    return `<span class="badge ${cls}"><span class="badge-dot"></span>${Admin.escapeHtml(status || 'pending')}</span>`;
  }

  async function loadTasks(spin) {
    const body = document.getElementById('tasksTableBody');
    const refreshBtn = document.getElementById('btnRefreshTasks');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="6" class="table-empty">Loading scheduled tasks…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        task_type: state.taskType,
        is_active: state.isActive,
        limit: state.limit,
      }));
      jobs = res.data.jobs || [];
      renderTasksTable();
    } catch (err) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">Couldn't load scheduled tasks.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTasksTable() {
    const body = document.getElementById('tasksTableBody');
    if (!jobs.length) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">No scheduled tasks yet. Click "Schedule New Task" to create one.</td></tr>`;
      return;
    }
    body.innerHTML = jobs.map((j) => `
      <tr data-id="${j.jobId}">
        <td><strong>${Admin.escapeHtml(j.jobName)}</strong></td>
        <td class="cell-muted">${Admin.escapeHtml(j.taskType)}</td>
        <td class="cell-muted">${Admin.formatDate(j.nextRunAt)}</td>
        <td>${jobStatusBadge(j.lastStatus)}</td>
        <td>${Admin.badge(j.isActive, 'Enabled', 'Paused')}${j.isActive ? ` <span class="count-pill-soft" title="Whether the cron task is currently loaded in memory">${j.isRunningLive ? 'live' : 'not loaded'}</span>` : ''}</td>
        <td class="cell-actions">
          <button class="icon-action icon-action-view" data-act="history" title="View history">${ICON.history}</button>
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
          ${j.isActive
            ? `<button class="icon-action icon-action-toggle" data-act="pause" title="Pause">${ICON.pause}</button>`
            : `<button class="icon-action icon-action-toggle" data-act="resume" title="Resume">${ICON.play}</button>`}
          <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const j = jobs.find((x) => String(x.jobId) === tr.dataset.id);
      tr.querySelector('[data-act="history"]')?.addEventListener('click', () => openHistoryModal(j));
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditTaskModal(j));
      tr.querySelector('[data-act="pause"]')?.addEventListener('click', () => setActive(j, false));
      tr.querySelector('[data-act="resume"]')?.addEventListener('click', () => setActive(j, true));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => remove(j));
    });
  }

  async function setActive(j, active) {
    try {
      await Admin.api.patch(active ? API.resume(j.jobId) : API.pause(j.jobId));
      Admin.toast(active ? 'Task resumed' : 'Task paused', 'success');
      loadTasks(true);
    } catch (err) { Admin.toastError(err); }
  }

  async function remove(j) {
    const ok = await Admin.confirmAction({
      title: 'Delete task?',
      body: `Delete <strong>${Admin.escapeHtml(j.jobName)}</strong>? This can't be undone.`,
      confirmLabel: 'Delete task',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.remove(j.jobId));
      Admin.toast('Task deleted', 'success');
      loadTasks(true);
    } catch (err) { Admin.toastError(err); }
  }

  // ---- Add / Edit task modal ---------------------------------------------

  function taskFormHtml(j) {
    const isEdit = !!j;
    const cfg = isEdit && j.taskConfig ? safeStringify(j.taskConfig) : '';
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit Scheduled Task' : 'Schedule a New Task'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="taskForm">
        <div class="modal-body">
          <div id="taskFormErrors"></div>
          ${isEdit ? `<div class="field-hint" style="margin-bottom:14px;">If this task is currently <strong>enabled</strong>, saving restarts it right away with the new schedule. If it's <strong>paused</strong>, it stays paused — use Pause/Resume to change that.</div>` : ''}
          <div class="form-row">
            <div class="form-group">
              <label for="f-jobName">Task Name <span style="color:var(--coral);">*</span></label>
              <input type="text" id="f-jobName" placeholder="e.g. Weekly digest email" value="${isEdit ? Admin.escapeHtml(j.jobName) : ''}" required>
            </div>
            <div class="form-group">
              <label for="f-taskType">Task Type <span style="color:var(--coral);">*</span></label>
              <select id="f-taskType" class="task-type-select" required></select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-startAt">Start Date &amp; Time <span style="color:var(--coral);">*</span></label>
              <input type="datetime-local" id="f-startAt" value="${isEdit ? toDatetimeLocal(j.startAt) : ''}" required>
            </div>
            <div class="form-group">
              <label for="f-endAt">End Date &amp; Time</label>
              <input type="datetime-local" id="f-endAt" value="${isEdit ? toDatetimeLocal(j.endAt) : ''}">
              <div class="field-hint">Leave blank to run indefinitely.</div>
            </div>
          </div>
          <div class="form-group">
            <label>Repeat</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:13px;color:var(--text-muted);">Every</span>
              <input type="number" id="f-interval" min="1" step="1" value="${isEdit ? j.intervalValue : 1}" style="width:90px;" required>
              <select id="f-unit" style="width:150px;">
                <option value="seconds" ${isEdit && j.intervalUnit === 'seconds' ? 'selected' : ''}>second(s)</option>
                <option value="minutes" ${isEdit && j.intervalUnit === 'minutes' ? 'selected' : ''}>minute(s)</option>
                <option value="hours" ${isEdit && j.intervalUnit === 'hours' ? 'selected' : ''}>hour(s)</option>
                <option value="days" ${!isEdit || j.intervalUnit === 'days' ? 'selected' : ''}>day(s)</option>
                <option value="weeks" ${isEdit && j.intervalUnit === 'weeks' ? 'selected' : ''}>week(s)</option>
                <option value="months" ${isEdit && j.intervalUnit === 'months' ? 'selected' : ''}>month(s)</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="f-taskConfig">Task Config (optional)</label>
            <textarea id="f-taskConfig" rows="5" style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12.5px;" placeholder='{ "url": "https://example.com/api", "method": "POST" }'>${Admin.escapeHtml(cfg)}</textarea>
            <div class="field-hint" id="f-taskConfigHint">Extra details this task needs (e.g. URL, method, headers), as JSON. Leave blank if not needed.</div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="taskFormSubmit">${isEdit ? 'Save Changes' : 'Schedule Task'}</button>
        </div>
      </form>
    `;
  }

  async function openAddTaskModal() {
    if (!taskTypes.length) await loadTaskTypes(true);
    Admin.openModal(taskFormHtml(null));
    populateTaskTypeSelects();
    wireJsonValidation('f-taskConfig', 'f-taskConfigHint', 'Extra details this task needs (e.g. URL, method, headers), as JSON. Leave blank if not needed.');
    wireTaskForm(null);
  }

  async function openEditTaskModal(j) {
    if (!taskTypes.length) await loadTaskTypes(true);
    Admin.openModal(taskFormHtml(j));
    document.querySelector('#modalBackdrop .modal').classList.add('modal-lg');
    populateTaskTypeSelects();
    document.getElementById('f-taskType').value = j.taskType;
    wireJsonValidation('f-taskConfig', 'f-taskConfigHint', 'Extra details this task needs (e.g. URL, method, headers), as JSON. Leave blank if not needed.');
    wireTaskForm(j);
  }

  function wireTaskForm(j) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#taskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('taskFormErrors');
      errBox.innerHTML = '';

      const cfg = readJson('f-taskConfig');
      if (!cfg.ok) { Admin.toast('Fix the JSON in Task Config before saving', 'error'); return; }
      if (!document.getElementById('f-taskType').value) { Admin.toast('Please choose a task type', 'error'); return; }

      const btn = document.getElementById('taskFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');
      const payload = {
        job_name: document.getElementById('f-jobName').value.trim(),
        task_type: document.getElementById('f-taskType').value,
        start_at: toIso(document.getElementById('f-startAt').value),
        end_at: toIso(document.getElementById('f-endAt').value),
        interval: Number(document.getElementById('f-interval').value),
        unit: document.getElementById('f-unit').value,
        task_config: cfg.value,
      };
      try {
        if (j) {
          await Admin.api.patch(API.update(j.jobId), payload);
          Admin.toast('Task updated', 'success');
        } else {
          await Admin.api.post(API.list, payload);
          Admin.toast('Task scheduled', 'success');
        }
        Admin.closeModal();
        loadTasks(true);
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong></div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  // ---- History modal -------------------------------------------------------

  async function openHistoryModal(j) {
    Admin.openModal(`<div class="modal-body"><span class="spinner spinner-dark"></span> Loading history…</div>`);
    document.querySelector('#modalBackdrop .modal').classList.add('modal-lg');
    try {
      const res = await Admin.api.get(API.runs(j.jobId) + Admin.qs({ limit: 50 }));
      renderHistoryModal(j, res.data.runs || []);
    } catch (err) {
      Admin.closeModal();
      Admin.toastError(err);
    }
  }

  function renderHistoryModal(j, runs) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.innerHTML = `<div class="modal modal-lg">
      <div class="modal-header"><h3>History — ${Admin.escapeHtml(j.jobName)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        ${!runs.length ? `<div class="table-empty">No runs recorded yet for this task.</div>` : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>STARTED</th><th>FINISHED</th><th>RESULT</th><th>DURATION</th><th>ERROR</th></tr></thead>
            <tbody>
              ${runs.map((r) => `
                <tr>
                  <td class="cell-muted">${Admin.formatDate(r.startedAt)}</td>
                  <td class="cell-muted">${Admin.formatDate(r.finishedAt)}</td>
                  <td>${jobStatusBadge(r.status)}</td>
                  <td class="cell-muted">${r.durationMs != null ? (r.durationMs / 1000).toFixed(1) + 's' : '—'}</td>
                  <td class="cell-muted" style="max-width:220px;">${Admin.escapeHtml(r.errorMessage || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      </div>
    </div>`;
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
  }

  // ---- Small helpers ---------------------------------------------------

  /** JSON.parse that requires a plain object (or empty -> undefined), matching what task_config/config_schema expect. */
  function readJson(textareaId) {
    const raw = document.getElementById(textareaId).value.trim();
    if (!raw) return { ok: true, value: undefined };
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ok: false, error: 'Must be a JSON object, e.g. { "key": "value" }' };
      }
      return { ok: true, value: parsed };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  function safeStringify(v) {
    try { return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2); } catch (e) { return typeof v === 'string' ? v : ''; }
  }
  function wireJsonValidation(textareaId, hintId, defaultHint) {
    const ta = document.getElementById(textareaId);
    const hint = document.getElementById(hintId);
    const update = () => {
      const raw = ta.value.trim();
      if (!raw) { hint.textContent = defaultHint; hint.style.color = ''; ta.style.borderColor = ''; return; }
      const r = readJson(textareaId);
      if (r.ok) { hint.textContent = '✓ Valid JSON'; hint.style.color = 'var(--green)'; ta.style.borderColor = 'var(--green)'; }
      else { hint.textContent = 'Invalid JSON — ' + r.error; hint.style.color = 'var(--coral)'; ta.style.borderColor = 'var(--coral)'; }
    };
    ta.addEventListener('input', update);
    ta.addEventListener('blur', update);
  }
  function toIso(v) { return v ? new Date(v).toISOString() : undefined; }
  function toDatetimeLocal(v) {
    if (!v) return '';
    const d = new Date(String(v).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  init();
})();
