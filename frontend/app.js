// ── Use relative paths so cookies are always same-origin ──────
const API = '/api';

// ── State ──────────────────────────────────────────────────────
let allEntries = [];
let currentCategory = 'all';
let deleteTargetId = null;

// ── Category icons map ─────────────────────────────────────────
const ICONS = {
  'E-Commerce':   '🛒',
  'Banking':      '🏦',
  'Airlines':     '✈️',
  'Social Media': '💬',
  'Email':        '📧',
  'Streaming':    '📺',
  'Work':         '💼',
  'Gaming':       '🎮',
  'Government':   '🏛',
  'Other':        '📁',
};

// ── Init ───────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const res = await fetch(`${API}/auth/status`);
  const data = await res.json();

  if (data.is_logged_in) {
    showApp();
    loadEntries();
  } else if (!data.is_setup) {
    showSetupMode();
  }
  // else: show login mode (default)
});

function showSetupMode() {
  document.getElementById('auth-title').textContent = 'Create Master Password';
  document.getElementById('auth-subtitle').textContent = 'This password encrypts all your data. Don\'t forget it.';
  document.getElementById('confirm-group').style.display = 'block';
  document.getElementById('auth-btn').textContent = 'Set Password & Continue';
  window._authMode = 'setup';
}

window._authMode = 'login';

// ── Auth ───────────────────────────────────────────────────────
async function handleAuth() {
  const pw = document.getElementById('master-password').value;
  const errorEl = document.getElementById('auth-error');
  errorEl.style.display = 'none';

  if (!pw) {
    showAuthError('Please enter your master password.');
    return;
  }

  if (window._authMode === 'setup') {
    const confirm = document.getElementById('confirm-password').value;
    if (pw.length < 8) { showAuthError('Password must be at least 8 characters.'); return; }
    if (pw !== confirm) { showAuthError('Passwords do not match.'); return; }

    const res = await fetch(`${API}/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error); return; }
  } else {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error); return; }
  }

  showApp();
  loadEntries();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('auth-screen').style.display !== 'none') {
    handleAuth();
  }
});

async function logout() {
  await fetch(`${API}/auth/logout`, { method: 'POST' });
  location.reload();
}

// ── Show/hide screens ──────────────────────────────────────────
function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';
}

// ── Load & render entries ──────────────────────────────────────
async function loadEntries() {
  const res = await fetch(`${API}/credentials`);
  if (res.status === 401) { location.reload(); return; }
  allEntries = await res.json();
  renderEntries();
}

function renderEntries(filter = '') {
  const grid = document.getElementById('entries-grid');
  const empty = document.getElementById('empty-state');
  const search = filter.toLowerCase();

  let entries = allEntries;
  if (currentCategory !== 'all') {
    entries = entries.filter(e => e.category === currentCategory);
  }
  if (search) {
    entries = entries.filter(e =>
      e.site_name.toLowerCase().includes(search) ||
      e.category.toLowerCase().includes(search) ||
      (e.email || '').toLowerCase().includes(search) ||
      (e.username || '').toLowerCase().includes(search)
    );
  }

  if (entries.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = entries.map(e => entryCard(e)).join('');
}

function entryCard(e) {
  const icon = ICONS[e.category] || '📁';
  const hasUsername = e.username && e.username.trim();
  const hasEmail = e.email && e.email.trim();
  const hasNotes = e.notes && e.notes.trim();

  return `
  <div class="entry-card" id="card-${e.id}">
    <div class="entry-top">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="entry-icon">${icon}</div>
        <div>
          <div class="entry-name">${escHtml(e.site_name)}</div>
          <div class="entry-category">${escHtml(e.category)}</div>
        </div>
      </div>
      <div class="entry-actions">
        <button class="icon-btn" title="Edit" onclick="openModal(${e.id})">✏️</button>
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
          <button class="copy-btn" onclick="copyToClipboard('${escHtml(e.password)}', 'Password')">📋</button>
        </div>
      </div>
      ${hasNotes ? `
      <div class="entry-field">
        <span class="field-label">Notes</span>
        <span class="field-value" style="white-space:pre-wrap;font-family:inherit;font-size:13px;">${escHtml(e.notes)}</span>
      </div>` : ''}
    </div>
  </div>`;
}

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

// ── Search ─────────────────────────────────────────────────────
function searchEntries() {
  const val = document.getElementById('search-input').value;
  renderEntries(val);
}

// ── Category filter ────────────────────────────────────────────
function filterCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const titles = {
    'all': 'All Entries', 'E-Commerce': 'E-Commerce', 'Banking': 'Banking',
    'Airlines': 'Airlines', 'Social Media': 'Social Media', 'Email': 'Email',
    'Streaming': 'Streaming', 'Work': 'Work', 'Gaming': 'Gaming',
    'Government': 'Government', 'Other': 'Other',
  };
  document.getElementById('category-title').textContent = titles[cat] || cat;
  document.getElementById('search-input').value = '';
  renderEntries();
}

// ── Modal ──────────────────────────────────────────────────────
function openModal(id = null) {
  clearModalForm();
  document.getElementById('modal-error').style.display = 'none';

  if (id) {
    const entry = allEntries.find(e => e.id === id);
    if (!entry) return;
    document.getElementById('modal-title').textContent = 'Edit Entry';
    document.getElementById('edit-id').value = id;
    document.getElementById('form-category').value = entry.category;
    document.getElementById('form-site').value = entry.site_name;
    document.getElementById('form-username').value = entry.username || '';
    document.getElementById('form-email').value = entry.email || '';
    document.getElementById('form-password').value = entry.password;
    document.getElementById('form-notes').value = entry.notes || '';
  } else {
    document.getElementById('modal-title').textContent = 'Add New Entry';
    document.getElementById('edit-id').value = '';
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
  ['form-category','form-site','form-username','form-email','form-password','form-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('edit-id').value = '';
}

async function saveEntry() {
  const errorEl = document.getElementById('modal-error');
  errorEl.style.display = 'none';

  const category = document.getElementById('form-category').value;
  const site_name = document.getElementById('form-site').value.trim();
  const username = document.getElementById('form-username').value.trim();
  const email = document.getElementById('form-email').value.trim();
  const password = document.getElementById('form-password').value;
  const notes = document.getElementById('form-notes').value.trim();
  const editId = document.getElementById('edit-id').value;

  if (!category) { showModalError('Please select a category.'); return; }
  if (!site_name) { showModalError('Site / App name is required.'); return; }
  if (!password) { showModalError('Password is required.'); return; }

  const payload = { category, site_name, username, email, password, notes };

  let res;
  if (editId) {
    res = await fetch(`${API}/credentials/${editId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    res = await fetch(`${API}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

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
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Delete ─────────────────────────────────────────────────────
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

// ── Utils ──────────────────────────────────────────────────────
function toggleVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard`, 'success');
  } catch {
    showToast('Failed to copy', 'error');
  }
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let toastTimer;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2500);
}
