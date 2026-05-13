document.addEventListener('DOMContentLoaded', () => {
  State.load();
  Settings.init();
  initAuthGate();
  Sidebar.init();
  Chat.init();
  FileHandler.init();

  const modelSel = document.getElementById('model-select');
  const savedModel = normalizeModelValue(State.getModel());
  modelSel.value = [...modelSel.options].some(option => option.value === savedModel) ? savedModel : 'auto';
  State.setModel(modelSel.value);
  modelSel.addEventListener('change', e => {
    const model = normalizeModelValue(e.target.value);
    e.target.value = model;
    State.setModel(model);
  });

  window.addEventListener('app-key-verified', () => {
    hideAuthGate();
  });

  Sidebar.render();
  const active = State.getActiveConv();
  Chat.loadConversation(active ? active.id : null);
  verifyStoredKey();

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const authGate = document.getElementById('auth-gate-modal');
      if (!authGate.classList.contains('hidden')) return;
      const modal = document.getElementById('settings-modal');
      if (!modal.classList.contains('hidden')) Settings.close();
    }
  });
});

function normalizeModelValue(model) {
  const value = String(model || '').trim();
  if (!value || value.toLowerCase() === 'auto' || value.toLowerCase() === 'default') {
    return 'auto';
  }
  return value;
}

function initAuthGate() {
  const form = document.getElementById('auth-gate-form');
  form?.addEventListener('submit', submitAuthGate);
}

async function submitAuthGate(event) {
  event.preventDefault();
  const input = document.getElementById('auth-gate-key-input');
  const button = document.getElementById('auth-gate-submit-btn');
  const key = input.value.trim();
  if (!key) {
    setAuthGateMessage('Vui lòng nhập App key.', true);
    input.focus();
    return;
  }

  button.disabled = true;
  button.textContent = 'Đang kiểm tra';
  try {
    const identity = await API.me(key);
    State.setApiKey(key);
    window.dispatchEvent(new CustomEvent('app-key-verified', { detail: identity }));
    Toast.show(`Đã đăng nhập (${identity.role})`, 'success');
  } catch (err) {
    State.setApiKey('');
    setAuthGateMessage(err.message || 'App key không hợp lệ.', true);
    input.focus();
  } finally {
    button.disabled = false;
    button.textContent = 'Tiếp tục';
  }
}

async function verifyStoredKey() {
  if (!State.getApiKey()) {
    showAuthGate('Bạn cần nhập App key hợp lệ để sử dụng chat.');
    return;
  }
  try {
    const identity = await API.me();
    window.dispatchEvent(new CustomEvent('app-key-verified', { detail: identity }));
  } catch (_) {
    State.setApiKey('');
    showAuthGate('App key đã lưu không còn hợp lệ. Vui lòng nhập lại.', true);
  }
}

function showAuthGate(message, isError = false) {
  const modal = document.getElementById('auth-gate-modal');
  const input = document.getElementById('auth-gate-key-input');
  setAuthGateMessage(message, isError);
  modal.classList.remove('hidden');
  setTimeout(() => input?.focus(), 0);
}

function hideAuthGate() {
  document.getElementById('auth-gate-modal')?.classList.add('hidden');
}

function setAuthGateMessage(message, isError = false) {
  const el = document.getElementById('auth-gate-message');
  el.textContent = message;
  el.classList.toggle('error', isError);
}
