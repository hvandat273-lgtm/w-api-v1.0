const API = (() => {
  const JSON_HEADERS = { 'Content-Type': 'application/json' };

  function getAuthKey() {
    return State.getApiKey?.() || localStorage.getItem('webchat.authKey') || '';
  }

  function authHeaders(extra = {}) {
    const key = getAuthKey();
    if (!key) throw new Error('Vui lòng nhập App key trong Cài đặt.');
    return { ...extra, Authorization: `Bearer ${key}` };
  }

  function authHeadersForKey(key, extra = {}) {
    if (!key) throw new Error('Vui lòng nhập App key.');
    return { ...extra, Authorization: `Bearer ${key}` };
  }

  async function request(path, options = {}, keyOverride = null) {
    const headers = keyOverride
      ? authHeadersForKey(keyOverride, options.headers || {})
      : authHeaders(options.headers || {});
    const res = await fetch(path, { ...options, headers });
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : null;
    if (!res.ok) {
      throw new Error(data?.detail || data?.error || `Lỗi server ${res.status}`);
    }
    return data;
  }

  async function me(keyOverride = null) {
    return request('/api/me', { method: 'GET' }, keyOverride);
  }

  async function chat(messages, model, onChunk, attachments = [], conversationId = null) {
    const res = await fetch('/api/chat/completions', {
      method: 'POST',
      headers: authHeaders(JSON_HEADERS),
      body: JSON.stringify({
        conversation_id: conversationId,
        messages,
        model,
        attachments,
        stream: false
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.error || `Lỗi server ${res.status}`);
    }

    const fullText = data.message?.content || '';
    if (onChunk) onChunk(fullText);
    return fullText;
  }

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('upload', file);
    const res = await fetch('/api/chat/files', {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || `Lỗi upload ${res.status}`);
    return data;
  }

  async function listAccounts() {
    return request('/api/admin/accounts', { method: 'GET' });
  }

  async function createAccount(payload) {
    return request('/api/admin/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    });
  }

  async function updateAccount(id, payload) {
    return request(`/api/admin/accounts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    });
  }

  async function deleteAccount(id) {
    return request(`/api/admin/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function checkAccount(id) {
    return request(`/api/admin/accounts/${encodeURIComponent(id)}/check`, { method: 'POST' });
  }

  async function listAuthKeys() {
    return request('/api/admin/auth-keys', { method: 'GET' });
  }

  async function createAuthKey(payload) {
    return request('/api/admin/auth-keys', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    });
  }

  async function updateAuthKey(id, payload) {
    return request(`/api/admin/auth-keys/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    });
  }

  async function deleteAuthKey(id) {
    return request(`/api/admin/auth-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  return {
    chat, uploadFile, me,
    listAccounts, createAccount, updateAccount, deleteAccount, checkAccount,
    listAuthKeys, createAuthKey, updateAuthKey, deleteAuthKey
  };
})();
