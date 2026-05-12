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

  return { chat, uploadFile };
})();
