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
    return chatStream(messages, model, onChunk, attachments, conversationId);
  }

  async function chatStream(messages, model, onChunk, attachments = [], conversationId = null) {
    const res = await fetch('/api/chat/completions/stream', {
      method: 'POST',
      headers: authHeaders(JSON_HEADERS),
      body: JSON.stringify({
        conversation_id: conversationId,
        messages,
        model,
        attachments,
        stream: true
      })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || data.error || `Lỗi server ${res.status}`);
    }
    if (!res.body) {
      return chatJson(messages, model, onChunk, attachments, conversationId);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let donePayload = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || '';
      for (const part of parts) {
        const event = parseSseEvent(part);
        if (!event) continue;
        if (event.event === 'delta') {
          const delta = event.data?.delta || '';
          fullText += delta;
          if (onChunk) onChunk(fullText, delta);
        } else if (event.event === 'done') {
          donePayload = event.data;
          const finalText = donePayload?.message?.content || fullText;
          if (finalText !== fullText) {
            fullText = finalText;
            if (onChunk) onChunk(fullText, '');
          }
        } else if (event.event === 'error') {
          throw new Error(event.data?.message || 'Upstream chat service failed.');
        }
      }
    }

    if (buffer.trim()) {
      const event = parseSseEvent(buffer);
      if (event?.event === 'error') {
        throw new Error(event.data?.message || 'Upstream chat service failed.');
      }
      if (event?.event === 'done') {
        donePayload = event.data;
        fullText = donePayload?.message?.content || fullText;
      }
    }

    return donePayload?.message?.content || fullText;
  }

  function parseSseEvent(raw) {
    const lines = raw.split(/\r?\n/);
    let event = 'message';
    const dataLines = [];
    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return null;
    try {
      return { event, data: JSON.parse(dataLines.join('\n')) };
    } catch (_) {
      return { event, data: { message: dataLines.join('\n') } };
    }
  }

  async function chatJson(messages, model, onChunk, attachments = [], conversationId = null) {
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

  async function getRouterSettings() {
    return request('/api/admin/router', { method: 'GET' });
  }

  async function updateRouterSettings(payload) {
    return request('/api/admin/router', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    });
  }

  async function checkRouterSettings() {
    return request('/api/admin/router/check', { method: 'POST' });
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
    getRouterSettings, updateRouterSettings, checkRouterSettings,
    listAuthKeys, createAuthKey, updateAuthKey, deleteAuthKey
  };
})();
