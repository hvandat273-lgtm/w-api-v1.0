const AdminApp = (() => {
  let accounts = [];
  let authKeys = [];

  function init() {
    State.load();
    document.documentElement.setAttribute('data-theme', State.getTheme());
    document.getElementById('admin-key-input').value = State.getApiKey();
    document.getElementById('admin-key-save-btn').addEventListener('click', saveAdminKey);
    document.getElementById('add-account-btn').addEventListener('click', () => openAccountModal());
    document.getElementById('add-key-btn').addEventListener('click', () => openKeyModal());
    document.getElementById('account-form').addEventListener('submit', saveAccount);
    document.getElementById('key-form').addEventListener('submit', saveAuthKey);
    document.getElementById('accounts-body').addEventListener('click', handleAccountAction);
    document.getElementById('keys-body').addEventListener('click', handleKeyAction);
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => selectTab(btn.dataset.tab));
    });
    verifyAdmin();
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
    await Promise.all([loadAccounts(), loadAuthKeys()]);
  }

  function showAuthOnly(message) {
    document.getElementById('identity-label').textContent = 'Chưa đăng nhập';
    document.getElementById('auth-panel').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('auth-message').textContent = message;
  }

  async function loadAccounts() {
    accounts = await API.listAccounts();
    renderAccounts();
  }

  async function loadAuthKeys() {
    authKeys = await API.listAuthKeys();
    renderAuthKeys();
  }

  function renderAccounts() {
    const body = document.getElementById('accounts-body');
    if (!accounts.length) {
      body.innerHTML = '<tr><td colspan="8">Chưa có account nào.</td></tr>';
      return;
    }
    body.innerHTML = accounts.map(account => {
      const meta = account.metadata || {};
      const lastCheck = meta.last_checked_at ? new Date(meta.last_checked_at).toLocaleString() : 'Chưa check';
      const statusClass = meta.last_check_ok === true ? 'alive' : meta.last_check_ok === false ? 'dead' : '';
      const statusText = meta.last_check_ok === true ? 'Alive' : meta.last_check_ok === false ? 'Dead' : 'Unknown';
      return `<tr>
        <td class="mono">${esc(account.id)}</td>
        <td>${esc(account.name)}</td>
        <td>${account.enabled ? 'Có' : 'Không'}</td>
        <td class="mono">${account.proxy ? esc(account.proxy) : '-'}</td>
        <td class="mono">${esc(account.secure_1psid_masked || '')}</td>
        <td class="mono">${esc(account.secure_1psidts_masked || '')}</td>
        <td><span class="status-pill ${statusClass}" title="${esc(lastCheck)}">${statusText}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn-secondary" data-account-action="check" data-id="${escAttr(account.id)}">Check</button>
            <button class="btn-secondary" data-account-action="edit" data-id="${escAttr(account.id)}">Sửa</button>
            <button class="btn-danger" data-account-action="delete" data-id="${escAttr(account.id)}">Xóa</button>
          </div>
        </td>
      </tr>`;
    }).join('');
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
    document.getElementById('accounts-tab').classList.toggle('hidden', tab !== 'accounts');
    document.getElementById('keys-tab').classList.toggle('hidden', tab !== 'keys');
  }

  function openAccountModal(account = null) {
    document.getElementById('account-form').reset();
    document.getElementById('account-edit-id').value = account?.id || '';
    document.getElementById('account-modal-title').textContent = account ? 'Sửa account' : 'Thêm account';
    document.getElementById('account-id').value = account?.id || '';
    document.getElementById('account-id').readOnly = Boolean(account);
    document.getElementById('account-name').value = account?.name || '';
    document.getElementById('account-enabled').checked = account ? account.enabled : true;
    document.getElementById('account-proxy').value = account?.proxy || '';
    document.getElementById('account-psid').placeholder = account ? 'Để trống nếu không đổi' : '__Secure-1PSID';
    document.getElementById('account-psidts').placeholder = account ? 'Để trống nếu không đổi' : '__Secure-1PSIDTS';
    document.getElementById('account-modal').classList.remove('hidden');
  }

  async function saveAccount(event) {
    event.preventDefault();
    const editId = document.getElementById('account-edit-id').value;
    const payload = {
      name: document.getElementById('account-name').value.trim(),
      enabled: document.getElementById('account-enabled').checked,
      proxy: document.getElementById('account-proxy').value.trim()
    };
    const psid = document.getElementById('account-psid').value.trim();
    const psidts = document.getElementById('account-psidts').value.trim();
    if (psid) payload.secure_1psid = psid;
    if (psidts) payload.secure_1psidts = psidts;

    if (!editId) {
      payload.id = document.getElementById('account-id').value.trim() || null;
      if (!payload.secure_1psid || !payload.secure_1psidts) {
        showToast('Cookie 1PSID và 1PSIDTS là bắt buộc khi thêm account.', 'error');
        return;
      }
    }

    try {
      if (editId) await API.updateAccount(editId, payload);
      else await API.createAccount(payload);
      closeModal('account-modal');
      await loadAccounts();
      showToast('Đã lưu account', 'success');
    } catch (err) {
      showToast(err.message, 'error', 5000);
    }
  }

  async function handleAccountAction(event) {
    const button = event.target.closest('[data-account-action]');
    if (!button) return;
    const id = button.dataset.id;
    const account = accounts.find(item => item.id === id);
    if (button.dataset.accountAction === 'edit') {
      openAccountModal(account);
      return;
    }
    if (button.dataset.accountAction === 'delete') {
      if (!confirm(`Xóa account ${id}?`)) return;
      try {
        await API.deleteAccount(id);
        await loadAccounts();
        showToast('Đã xóa account', 'success');
      } catch (err) {
        showToast(err.message, 'error', 5000);
      }
      return;
    }
    if (button.dataset.accountAction === 'check') {
      button.disabled = true;
      button.textContent = 'Đang check';
      try {
        const result = await API.checkAccount(id);
        await loadAccounts();
        showToast(result.message, result.ok ? 'success' : 'error', 5000);
      } catch (err) {
        showToast(err.message, 'error', 5000);
      } finally {
        button.disabled = false;
        button.textContent = 'Check';
      }
    }
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
