const AdminApp = (() => {
  let authKeys = [];

  function init() {
    State.load();
    ensureRouterApiFallbacks();
    document.documentElement.setAttribute('data-theme', State.getTheme());
    document.getElementById('admin-key-input').value = State.getApiKey();
    document.getElementById('admin-key-save-btn').addEventListener('click', saveAdminKey);
    document.getElementById('router-form').addEventListener('submit', saveRouterSettings);
    document.getElementById('check-router-btn').addEventListener('click', checkRouterSettings);
    document.getElementById('add-key-btn').addEventListener('click', () => openKeyModal());
    document.getElementById('key-form').addEventListener('submit', saveAuthKey);
    document.getElementById('keys-body').addEventListener('click', handleKeyAction);
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => selectTab(btn.dataset.tab));
    });
    verifyAdmin();
  }

  function ensureRouterApiFallbacks() {
    if (typeof API.getRouterSettings !== 'function') {
      API.getRouterSettings = () => adminRequest('/api/admin/router', { method: 'GET' });
    }
    if (typeof API.updateRouterSettings !== 'function') {
      API.updateRouterSettings = payload => adminRequest('/api/admin/router', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    if (typeof API.checkRouterSettings !== 'function') {
      API.checkRouterSettings = () => adminRequest('/api/admin/router/check', { method: 'POST' });
    }
  }

  async function adminRequest(path, options = {}) {
    const key = State.getApiKey();
    if (!key) throw new Error('Vui lòng nhập App key.');
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${key}`
      }
    });
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : null;
    if (!res.ok) throw new Error(data?.detail || data?.error || `Lỗi server ${res.status}`);
    return data;
  }

  async function saveAdminKey() {
    const key = document.getElementById('admin-key-input').value.trim();
    if (!key) {
      showToast('Vui lòng nhập App key', 'error');
      return;
    }
    try {
      const identity = await API.me(key);
      if (identity.role !== 'admin') throw new Error('Key này không có quyền admin.');
      State.setApiKey(key);
      await loadAdminData(identity);
      showToast('Đã xác thực admin key', 'success');
    } catch (err) {
      showAuthOnly(err.message || 'App key không hợp lệ');
    }
  }

  async function verifyAdmin() {
    if (!State.getApiKey()) {
      showAuthOnly('Vui lòng nhập Admin App key.');
      return;
    }
    try {
      const identity = await API.me();
      if (identity.role !== 'admin') throw new Error('Key hiện tại không có quyền admin.');
      await loadAdminData(identity);
    } catch (err) {
      showAuthOnly(err.message || 'Không thể xác thực App key.');
    }
  }

  async function loadAdminData(identity) {
    document.getElementById('identity-label').textContent = `${identity.id} (${identity.role})`;
    document.getElementById('auth-panel').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    await Promise.all([loadRouterSettings(), loadAuthKeys()]);
  }

  function showAuthOnly(message) {
    document.getElementById('identity-label').textContent = 'Chưa đăng nhập';
    document.getElementById('auth-panel').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('auth-message').textContent = message;
  }

  async function loadRouterSettings() {
    const settings = await API.getRouterSettings();
    document.getElementById('router-enabled').checked = settings.enabled;
    document.getElementById('router-base-url').value = settings.base_url || '';
    document.getElementById('router-api-key').value = '';
    document.getElementById('router-api-key-masked').value = settings.api_key_masked || '';
    document.getElementById('router-max-file-mb').value = settings.upload?.max_file_mb || 20;
    document.getElementById('router-max-files').value = settings.upload?.max_files_per_message || 5;

    const modelSelect = document.getElementById('router-default-model');
    if (![...modelSelect.options].some(option => option.value === settings.default_model)) {
      modelSelect.add(new Option(settings.default_model, settings.default_model));
    }
    modelSelect.value = settings.default_model;

    const meta = settings.metadata || {};
    const status = meta.last_check_ok === true ? 'Alive' : meta.last_check_ok === false ? 'Dead' : 'Chưa check';
    document.getElementById('router-status').textContent = meta.last_checked_at
      ? `${status} - ${new Date(meta.last_checked_at).toLocaleString()} - ${meta.last_check_message || ''}`
      : status;
  }

  async function saveRouterSettings(event) {
    event.preventDefault();
    const payload = {
      enabled: document.getElementById('router-enabled').checked,
      base_url: document.getElementById('router-base-url').value.trim(),
      default_model: document.getElementById('router-default-model').value.trim(),
      max_file_mb: Number(document.getElementById('router-max-file-mb').value || 20),
      max_files_per_message: Number(document.getElementById('router-max-files').value || 5)
    };
    const apiKey = document.getElementById('router-api-key').value.trim();
    if (apiKey) payload.api_key = apiKey;

    try {
      await API.updateRouterSettings(payload);
      await loadRouterSettings();
      showToast('Đã lưu cấu hình 9Router', 'success');
    } catch (err) {
      showToast(err.message, 'error', 5000);
    }
  }

  async function checkRouterSettings() {
    const button = document.getElementById('check-router-btn');
    button.disabled = true;
    button.textContent = 'Đang check';
    try {
      const result = await API.checkRouterSettings();
      await loadRouterSettings();
      showToast(result.message, result.ok ? 'success' : 'error', 5000);
    } catch (err) {
      showToast(err.message, 'error', 5000);
    } finally {
      button.disabled = false;
      button.textContent = 'Check';
    }
  }

  async function loadAuthKeys() {
    authKeys = await API.listAuthKeys();
    renderAuthKeys();
  }

  function renderAuthKeys() {
    const body = document.getElementById('keys-body');
    if (!authKeys.length) {
      body.innerHTML = '<tr><td colspan="4">Chưa có key nào.</td></tr>';
      return;
    }
    body.innerHTML = authKeys.map(item => `<tr>
      <td class="mono">${esc(item.id)}</td>
      <td>${esc(item.role)}</td>
      <td class="mono">${esc(item.key_masked || '')}</td>
      <td>
        <div class="row-actions">
          <button class="btn-secondary" data-key-action="edit" data-id="${escAttr(item.id)}">Sửa</button>
          <button class="btn-danger" data-key-action="delete" data-id="${escAttr(item.id)}">Xóa</button>
        </div>
      </td>
    </tr>`).join('');
  }

  function selectTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.getElementById('router-tab').classList.toggle('hidden', tab !== 'router');
    document.getElementById('keys-tab').classList.toggle('hidden', tab !== 'keys');
  }

  function openKeyModal(item = null) {
    document.getElementById('key-form').reset();
    document.getElementById('key-edit-id').value = item?.id || '';
    document.getElementById('key-modal-title').textContent = item ? 'Sửa App key' : 'Thêm App key';
    document.getElementById('key-id').value = item?.id || '';
    document.getElementById('key-id').readOnly = Boolean(item);
    document.getElementById('key-role').value = item?.role || 'user';
    document.getElementById('key-value').placeholder = item ? 'Để trống nếu không đổi' : 'App key mới';
    document.getElementById('key-modal').classList.remove('hidden');
  }

  async function saveAuthKey(event) {
    event.preventDefault();
    const editId = document.getElementById('key-edit-id').value;
    const keyValue = document.getElementById('key-value').value.trim();
    const payload = { role: document.getElementById('key-role').value };
    if (keyValue) payload.key = keyValue;

    if (!editId) {
      payload.id = document.getElementById('key-id').value.trim();
      if (!payload.id || !payload.key) {
        showToast('ID và key là bắt buộc khi thêm App key.', 'error');
        return;
      }
    }

    try {
      if (editId) await API.updateAuthKey(editId, payload);
      else await API.createAuthKey(payload);
      closeModal('key-modal');
      await loadAuthKeys();
      showToast('Đã lưu App key', 'success');
    } catch (err) {
      showToast(err.message, 'error', 5000);
    }
  }

  async function handleKeyAction(event) {
    const button = event.target.closest('[data-key-action]');
    if (!button) return;
    const id = button.dataset.id;
    const item = authKeys.find(key => key.id === id);
    if (button.dataset.keyAction === 'edit') {
      openKeyModal(item);
      return;
    }
    if (!confirm(`Xóa App key ${id}?`)) return;
    try {
      await API.deleteAuthKey(id);
      await loadAuthKeys();
      showToast('Đã xóa App key', 'success');
    } catch (err) {
      showToast(err.message, 'error', 5000);
    }
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function escAttr(value) {
    return esc(value);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', AdminApp.init);
