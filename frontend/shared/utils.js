// ── Shared utilities used by both login and dashboard ──────────

const API = '/api';

/**
 * Escape a string for safe HTML insertion.
 */
function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Toggle a password input between visible and masked.
 * Updates the button emoji accordingly.
 */
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

/**
 * Copy text to clipboard and show a toast confirmation.
 */
async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard`, 'success');
  } catch {
    showToast('Failed to copy', 'error');
  }
}

/**
 * Show a temporary toast notification.
 * @param {string} msg    - Message to display
 * @param {string} type   - 'success' | 'error' | ''
 */
let _toastTimer;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2500);
}
