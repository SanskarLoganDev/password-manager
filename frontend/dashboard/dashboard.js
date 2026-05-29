// ── Dashboard page logic ───────────────────────────────────────

// ── State ──────────────────────────────────────────────────────
let allEntries      = [];
let currentCategory = 'all';
let deleteTargetId  = null;

const CATEGORY_TITLES = {
  'all':          'All Entries',
  'E-Commerce':   'E-Commerce',
  'Banking':      'Banking',
  'Airlines':     'Airlines',
  'Social Media': 'Social Media',
  'Email':        'Email',
  'Developer':    'Developer',
  'Streaming':    'Streaming',
  'Work':         'Work',
  'Gaming':       'Gaming',
  'Government':   'Government',
  'Websites':     'Websites',
  'Other':        'Other',
};

const CATEGORY_ICONS = {
  'E-Commerce':   '🛒',
  'Banking':      '🏦',
  'Airlines':     '✈️',
  'Social Media': '💬',
  'Email':        '📧',
  'Developer':    '💻',
  'Streaming':    '📺',
  'Work':         '💼',
  'Gaming':       '🎮',
  'Government':   '🏛',
  'Websites':     '🌐',
  'Other':        '📁',
};

// ── On load: guard auth, then fetch entries ────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const res  = await fetch(`${API}/auth/status`);
  const data = await res.json();
  if (!data.is_logged_in) { window.location.href = '/'; return; }
  await loadEntries();
});

// ── Lock — clears session key, returns to login screen ─────────
// The Flask process keeps running so re-login is instant.
async function logout() {
  await fetch(`${API}/auth/logout`, { method: 'POST' });
  window.location.href = '/';
}

// ── Shut Down — locks AND kills the Flask process entirely ─────
// Use this when you're done and want nothing running in Task Manager.
async function shutdown() {
  if (!confirm('Shut down VaultKey completely?\n\nThis will close the app and stop the server process.')) {
    return;
  }
  try {
    await fetch(`${API}/shutdown`, { method: 'POST' });
  } catch {
    // Expected: fetch may throw because the server closed mid-response
  }
  document.body.innerHTML = `
    <div style="
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; height:100vh; gap:16px;
      font-family:'Segoe UI',system-ui,sans-serif; color:#4a4f6a;
      background:#f0f2f7;
    ">
      <div style="font-size:52px">🔐</div>
      <h2 style="font-size:22px; color:#1a1d2e;">VaultKey has shut down</h2>
      <p style="font-size:14px;">You can close this tab.</p>
    </div>`;
}

// ── Fetch & store entries ──────────────────────────────────────
async function loadEntries() {
  const res = await fetch(`${API}/credentials`);
  if (res.status === 401) { window.location.href = '/'; return; }
  allEntries = await res.json();
  renderEntries();
}

// ── Card order — localStorage helpers ─────────────────────────
// Order is stored per-category as an array of credential IDs.
// Key format: "vaultkey_order_<category>"
// Only applies when viewing a specific category — "all" is never ordered.

function getOrderKey(category) {
  return `vaultkey_order_${category}`;
}

/**
 * Load the saved ID order for a category from localStorage.
 * Returns an array of IDs, or [] if none saved yet.
 */
function loadOrder(category) {
  try {
    const raw = localStorage.getItem(getOrderKey(category));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save the current visual order of cards to localStorage.
 * Reads the data-id attribute from each card DOM element in the grid.
 */
function saveOrder(category) {
  if (category === 'all') return; // "All Entries" is never persisted
  const cards = document.querySelectorAll('#entries-grid .entry-card');
  const ids   = Array.from(cards).map(c => parseInt(c.dataset.id, 10));
  localStorage.setItem(getOrderKey(category), JSON.stringify(ids));
}

/**
 * Apply the saved order to an array of entry objects.
 * Entries not in the saved order (newly added) are appended at the end.
 * This ensures new cards always appear without needing to reset order.
 */
function applySavedOrder(entries, category) {
  if (category === 'all') return entries; // no ordering for "All Entries"

  const savedIds = loadOrder(category);
  if (savedIds.length === 0) return entries; // no saved order yet — use default

  // Build a map for O(1) lookup
  const entryMap = new Map(entries.map(e => [e.id, e]));

  // Start with entries in saved order (filtering out any deleted ones)
  const ordered = savedIds
    .filter(id => entryMap.has(id))
    .map(id => entryMap.get(id));

  // Append any entries not in the saved order (newly added cards)
  const orderedIds = new Set(savedIds);
  entries.forEach(e => { if (!orderedIds.has(e.id)) ordered.push(e); });

  return ordered;
}

// ── Render filtered/searched entries ──────────────────────────
function renderEntries(filter = '') {
  const grid   = document.getElementById('entries-grid');
  const empty  = document.getElementById('empty-state');
  const search = filter.toLowerCase();

  let entries = allEntries;

  // Category filter
  if (currentCategory !== 'all') {
    entries = entries.filter(e => e.category === currentCategory);
  }

  // Search filter
  if (search) {
    entries = entries.filter(e =>
      e.site_name.toLowerCase().includes(search) ||
      e.category.toLowerCase().includes(search)  ||
      (e.email    || '').toLowerCase().includes(search) ||
      (e.username || '').toLowerCase().includes(search)
    );
  }

  if (entries.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  // Apply saved card order (only when not searching — searching shows all matches
  // in relevance order and is not a good time to apply a fixed manual sort)
  if (!search) {
    entries = applySavedOrder(entries, currentCategory);
  }

  empty.style.display = 'none';

  // Render cards — draggable only when viewing a specific category (not "all", not search)
  const isDraggable = currentCategory !== 'all' && !search;
  grid.innerHTML = entries.map(e => buildEntryCard(e, isDraggable)).join('');

  // Attach drag-and-drop listeners after rendering
  if (isDraggable) {
    initDragAndDrop();
  }
}

// ── Build a single entry card's HTML ──────────────────────────
// data-id is set on every card so saveOrder() can read the current visual order.
// The drag handle (⠿) is only shown in orderable views (category-specific, no search).
function buildEntryCard(e, draggable = false) {
  const icon        = CATEGORY_ICONS[e.category] || '📁';
  const hasUsername = e.username && e.username.trim();
  const hasEmail    = e.email    && e.email.trim();
  const hasNotes    = e.notes    && e.notes.trim();
  const hasExtras   = e.extra_fields && e.extra_fields.length > 0;

  return `
  <div class="entry-card ${draggable ? 'draggable' : ''}"
       id="card-${e.id}"
       data-id="${e.id}"
       ${draggable ? 'draggable="true"' : ''}>

    <div class="entry-top">
      <div style="display:flex;align-items:center;gap:14px">
        ${draggable ? '<span class="drag-handle" title="Drag to reorder">⠿</span>' : ''}
        <div class="entry-icon">${icon}</div>
        <div>
          <div class="entry-name">${escHtml(e.site_name)}</div>
          <div class="entry-category">${escHtml(e.category)}</div>
        </div>
      </div>
      <div class="entry-actions">
        <button class="icon-btn"        title="Edit"   onclick="openModal(${e.id})">✏️</button>
        <button class="icon-btn delete" title="Delete" onclick="openConfirm(${e.id}, '${escHtml(e.site_name)}')">🗑</button>
      </div>
    </div>

    <div class="entry-fields">
      ${hasUsername ? `
      <div class="entry-field">
        <span class="field-label">Username</span>
        <div class="field-value-wrap">
          <span class="field-value">${escHtml(e.username)}</span>
          <button class="copy-btn" onclick="copyToClipboard('${escHtml(e.username)}', 'Username')">📋</button>
        </div>
      </div>` : ''}

      ${hasEmail ? `
      <div class="entry-field">
        <span class="field-label">Email</span>
        <div class="field-value-wrap">
          <span class="field-value">${escHtml(e.email)}</span>
          <button class="copy-btn" onclick="copyToClipboard('${escHtml(e.email)}', 'Email')">📋</button>
        </div>
      </div>` : ''}

      <div class="entry-field">
        <span class="field-label">Password</span>
        <div class="field-value-wrap">
          <span class="field-value masked" id="pw-${e.id}">••••••••</span>
          <button class="reveal-btn" onclick="togglePassword(${e.id}, '${btoa(unescape(encodeURIComponent(e.password)))}')" title="Show/Hide">👁</button>
          <button class="copy-btn"   onclick="copyToClipboard('${escHtml(e.password)}', 'Password')">📋</button>
        </div>
      </div>

      ${hasExtras ? `
      <div class="card-extras-divider"></div>
      ${e.extra_fields.map((ef, idx) => `
      <div class="entry-field">
        <span class="field-label">${escHtml(ef.label)}</span>
        <div class="field-value-wrap">
          <span class="field-value masked" id="ef-${e.id}-${idx}">••••••••</span>
          <button class="reveal-btn" onclick="toggleExtraField('ef-${e.id}-${idx}', '${btoa(unescape(encodeURIComponent(ef.value)))}')" title="Show/Hide">👁</button>
          <button class="copy-btn" onclick="copyToClipboard('${escHtml(ef.value)}', '${escHtml(ef.label)}')">📋</button>
        </div>
      </div>`).join('')}` : ''}

      ${hasNotes ? `
      <div class="entry-field">
        <span class="field-label">Notes</span>
        <span class="field-value" style="white-space:pre-wrap;font-family:inherit;font-size:13px;">${escHtml(e.notes)}</span>
      </div>` : ''}
    </div>
  </div>`;
}

// ── Drag and Drop ──────────────────────────────────────────────
// Uses the native HTML5 Drag and Drop API — no external libraries.
// Only active when viewing a specific category (not "all", not a search).
// Order is saved to localStorage immediately after each drop.

let _dragSrcCard = null; // the card element currently being dragged

function initDragAndDrop() {
  const cards = document.querySelectorAll('#entries-grid .entry-card.draggable');

  cards.forEach(card => {
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragover',  onDragOver);
    card.addEventListener('dragenter', onDragEnter);
    card.addEventListener('dragleave', onDragLeave);
    card.addEventListener('drop',      onDrop);
    card.addEventListener('dragend',   onDragEnd);
  });
}

function onDragStart(e) {
  _dragSrcCard = this;
  // Store the dragged card's ID in the dataTransfer object
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
  // Short delay so the card doesn't immediately look "ghosted" under the cursor
  setTimeout(() => this.classList.add('dragging'), 0);
}

function onDragOver(e) {
  // Must prevent default to allow dropping
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function onDragEnter(e) {
  // Highlight the card the dragged item is hovering over
  if (this !== _dragSrcCard) {
    this.classList.add('drag-over');
  }
}

function onDragLeave(e) {
  this.classList.remove('drag-over');
}

function onDrop(e) {
  e.stopPropagation();
  e.preventDefault();

  if (_dragSrcCard === this) return; // dropped on itself — do nothing

  const grid = document.getElementById('entries-grid');
  const cards = Array.from(grid.querySelectorAll('.entry-card'));
  const srcIdx  = cards.indexOf(_dragSrcCard);
  const destIdx = cards.indexOf(this);

  // Re-insert the dragged card before or after the drop target
  if (srcIdx < destIdx) {
    // Dragging forward — insert after the target
    grid.insertBefore(_dragSrcCard, this.nextSibling);
  } else {
    // Dragging backward — insert before the target
    grid.insertBefore(_dragSrcCard, this);
  }

  this.classList.remove('drag-over');

  // Persist the new order to localStorage immediately
  saveOrder(currentCategory);
}

function onDragEnd(e) {
  // Clean up all drag state classes from every card
  document.querySelectorAll('#entries-grid .entry-card').forEach(card => {
    card.classList.remove('dragging', 'drag-over');
  });
  _dragSrcCard = null;
}

// ── Toggle password reveal on card ────────────────────────────
function togglePassword(id, b64pw) {
  const el = document.getElementById(`pw-${id}`);
  if (el.classList.contains('masked')) {
    el.textContent = decodeURIComponent(escape(atob(b64pw)));
    el.classList.remove('masked');
  } else {
    el.textContent = '••••••••';
    el.classList.add('masked');
  }
}

// ── Toggle extra field reveal on card ─────────────────────────
function toggleExtraField(elemId, b64val) {
  const el = document.getElementById(elemId);
  if (el.classList.contains('masked')) {
    el.textContent = decodeURIComponent(escape(atob(b64val)));
    el.classList.remove('masked');
  } else {
    el.textContent = '••••••••';
    el.classList.add('masked');
  }
}

// ── Search ─────────────────────────────────────────────────────
function searchEntries() {
  renderEntries(document.getElementById('search-input').value);
}

// ── Sidebar category filter ────────────────────────────────────
function filterCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('category-title').textContent = CATEGORY_TITLES[cat] || cat;
  document.getElementById('search-input').value = '';
  renderEntries();
}

// ── Extra fields — modal management ───────────────────────────

/**
 * Add a blank label + value row to the extra fields list in the modal.
 * Called by the "+ Add Field" button.
 */
function addExtraFieldRow(label = '', value = '') {
  const list = document.getElementById('extra-fields-list');
  const row  = document.createElement('div');
  row.className = 'extra-field-row';
  row.innerHTML = `
    <input type="text"     class="ef-label" placeholder="Label  (e.g. Security Question, Backup Password)" value="${escHtml(label)}" />
    <div class="input-wrap ef-value-wrap">
      <input type="password" class="ef-value" placeholder="Value" value="${escHtml(value)}" />
      <button class="toggle-pw" onclick="toggleVisibility2(this)" type="button">👁</button>
    </div>
    <button class="ef-remove-btn" onclick="removeExtraFieldRow(this)" title="Remove">✕</button>
  `;
  list.appendChild(row);
}

/** Toggle visibility for extra field inputs (uses sibling reference, not id). */
function toggleVisibility2(btn) {
  const input = btn.previousElementSibling;
  if (input.type === 'password') { input.type = 'text';     btn.textContent = '🙈'; }
  else                           { input.type = 'password'; btn.textContent = '👁'; }
}

function removeExtraFieldRow(btn) {
  btn.closest('.extra-field-row').remove();
}

/** Read all extra field rows from the modal into an array. */
function collectExtraFields() {
  const rows = document.querySelectorAll('#extra-fields-list .extra-field-row');
  const fields = [];
  rows.forEach(row => {
    const label = row.querySelector('.ef-label').value.trim();
    const value = row.querySelector('.ef-value').value.trim();
    if (label && value) fields.push({ label, value });
  });
  return fields;
}

// ── Add / Edit modal ───────────────────────────────────────────
function openModal(id = null) {
  clearModalForm();
  document.getElementById('modal-error').style.display = 'none';

  if (id) {
    const entry = allEntries.find(e => e.id === id);
    if (!entry) return;
    document.getElementById('modal-title').textContent = 'Edit Entry';
    document.getElementById('edit-id').value           = id;
    document.getElementById('form-category').value     = entry.category;
    document.getElementById('form-site').value         = entry.site_name;
    document.getElementById('form-username').value     = entry.username || '';
    document.getElementById('form-email').value        = entry.email    || '';
    document.getElementById('form-password').value     = entry.password;
    document.getElementById('form-notes').value        = entry.notes    || '';

    // Populate existing extra fields
    (entry.extra_fields || []).forEach(ef => addExtraFieldRow(ef.label, ef.value));
  } else {
    document.getElementById('modal-title').textContent = 'Add New Entry';
    document.getElementById('edit-id').value           = '';
    if (currentCategory !== 'all') {
      document.getElementById('form-category').value = currentCategory;
    }
  }

  document.getElementById('modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('form-site').focus(), 50);
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  clearModalForm();
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function clearModalForm() {
  ['form-category', 'form-site', 'form-username', 'form-email', 'form-password', 'form-notes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('edit-id').value               = '';
  document.getElementById('extra-fields-list').innerHTML = '';
}

async function saveEntry() {
  const errorEl = document.getElementById('modal-error');
  errorEl.style.display = 'none';

  const category  = document.getElementById('form-category').value;
  const site_name = document.getElementById('form-site').value.trim();
  const username  = document.getElementById('form-username').value.trim();
  const email     = document.getElementById('form-email').value.trim();
  const password  = document.getElementById('form-password').value;
  const notes     = document.getElementById('form-notes').value.trim();
  const editId    = document.getElementById('edit-id').value;
  const extra_fields = collectExtraFields();

  if (!category)  { showModalError('Please select a category.');    return; }
  if (!site_name) { showModalError('Site / App name is required.'); return; }
  if (!password)  { showModalError('Password is required.');        return; }

  const payload = { category, site_name, username, email, password, notes, extra_fields };
  const url     = editId ? `${API}/credentials/${editId}` : `${API}/credentials`;
  const method  = editId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json();
    showModalError(data.error || 'Something went wrong.');
    return;
  }

  closeModal();
  await loadEntries();
  showToast(editId ? 'Entry updated ✓' : 'Entry saved ✓', 'success');
}

function showModalError(msg) {
  const el = document.getElementById('modal-error');
  el.textContent   = msg;
  el.style.display = 'block';
}

// ── Delete confirm modal ───────────────────────────────────────
function openConfirm(id, name) {
  deleteTargetId = id;
  document.getElementById('confirm-site-name').textContent = name;
  document.getElementById('confirm-overlay').style.display = 'flex';
}

function closeConfirm() {
  deleteTargetId = null;
  document.getElementById('confirm-overlay').style.display = 'none';
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  const res = await fetch(`${API}/credentials/${deleteTargetId}`, { method: 'DELETE' });
  if (res.ok) {
    closeConfirm();
    await loadEntries();
    showToast('Entry deleted', 'success');
  }
}



