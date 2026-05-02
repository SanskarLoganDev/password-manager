// ── Login page logic ───────────────────────────────────────────

let _authMode = 'login';

// ── On load: check auth status ────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const res  = await fetch(`${API}/auth/status`);
  const data = await res.json();

  if (data.is_logged_in) {
    // Already authenticated — go straight to dashboard
    window.location.href = '/dashboard';
    return;
  }

  if (!data.is_setup) {
    activateSetupMode();
  }
  // else: default login mode is already shown
});

// ── Switch UI to first-run setup mode ─────────────────────────
function activateSetupMode() {
  _authMode = 'setup';
  document.getElementById('auth-title').textContent    = 'Create Master Password';
  document.getElementById('auth-subtitle').textContent = "This password encrypts all your data. Don't forget it.";
  document.getElementById('confirm-group').style.display = 'flex'; // 'flex' not 'block' so gap is preserved
  document.getElementById('auth-btn').textContent      = 'Set Password & Continue';
}

// ── Handle Unlock / Set Password button ───────────────────────
async function handleAuth() {
  const pw      = document.getElementById('master-password').value;
  const errorEl = document.getElementById('auth-error');
  errorEl.style.display = 'none';

  if (!pw) {
    showAuthError('Please enter your master password.');
    return;
  }

  if (_authMode === 'setup') {
    const confirm = document.getElementById('confirm-password').value;
    if (pw.length < 8)  { showAuthError('Password must be at least 8 characters.'); return; }
    if (pw !== confirm) { showAuthError('Passwords do not match.'); return; }

    const res  = await fetch(`${API}/auth/setup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error); return; }

  } else {
    const res  = await fetch(`${API}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error); return; }
  }

  // Successful auth → navigate to dashboard
  window.location.href = '/dashboard';
}

// ── Show an inline error below the form ───────────────────────
function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent    = msg;
  el.style.display  = 'block';
}

// ── Allow Enter key to submit ─────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAuth();
});
