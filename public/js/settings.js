const Settings = (() => {
  function init() {
    document.getElementById('settings-btn').addEventListener('click', open);
    document.getElementById('close-settings-btn').addEventListener('click', close);
    document.getElementById('close-settings-ok-btn').addEventListener('click', close);
    document.getElementById('settings-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) close();
    });
    document.getElementById('theme-dark-btn').addEventListener('click', () => applyTheme('dark'));
    document.getElementById('theme-light-btn').addEventListener('click', () => applyTheme('light'));
    document.getElementById('clear-history-btn').addEventListener('click', clearHistory);
    document.getElementById('save-app-key-btn')?.addEventListener('click', saveAppKey);

    applyTheme(State.getTheme());
  }

  function open() {
    updateThemeBtns(State.getTheme());
    const input = document.getElementById('app-key-input');
    if (input) input.value = State.getApiKey();
    document.getElementById('settings-modal').classList.remove('hidden');
    setTimeout(() => input?.focus(), 0);
  }

  function close() {
    document.getElementById('settings-modal').classList.add('hidden');
  }

  function applyTheme(theme) {
    State.setTheme(theme);
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeBtns(theme);
  }

  function updateThemeBtns(theme) {
    document.getElementById('theme-dark-btn').classList.toggle('active', theme === 'dark');
    document.getElementById('theme-light-btn').classList.toggle('active', theme === 'light');
  }

  function clearHistory() {
    if (!confirm('Xóa toàn bộ lịch sử? Hành động này không thể hoàn tác.')) return;
    State.clearAllConversations();
    Sidebar.render();
    Chat.loadConversation(null);
    Toast.show('Đã xóa toàn bộ lịch sử', 'success');
    close();
  }

  async function saveAppKey() {
    const input = document.getElementById('app-key-input');
    const key = input.value.trim();
    if (!key) {
      Toast.show('Vui lòng nhập App key', 'error');
      return;
    }
    try {
      const identity = await API.me(key);
      State.setApiKey(key);
      window.dispatchEvent(new CustomEvent('app-key-verified', { detail: identity }));
      Toast.show(`Đã lưu App key (${identity.role})`, 'success');
    } catch (err) {
      Toast.show(err.message || 'App key không hợp lệ', 'error', 5000);
    }
  }

  function requireKey() {
    if (State.getApiKey()) return;
    open();
    Toast.show('Vui lòng nhập App key để sử dụng chat', 'info', 4000);
  }

  return { init, open, close, requireKey };
})();

const Toast = (() => {
  function show(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  return { show };
})();
