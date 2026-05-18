const State = (() => {
  const KEYS = {
    apiKey: 'chatbox_api_key',
    theme: 'chatbox_theme',
    model: 'chatbox_model',
    conversations: 'chatbox_conversations',
    activeConv: 'chatbox_active_conv'
  };

  const MAX_STORAGE_BYTES = 4 * 1024 * 1024;

  let _state = {
    conversations: [],
    activeConvId: null,
    pendingAttachments: [],
    streaming: false
  };

  function load() {
    _state.conversations = _loadConversations();
    _state.activeConvId = localStorage.getItem(KEYS.activeConv) || null;
    if (_state.activeConvId && !_state.conversations.find(c => c.id === _state.activeConvId)) {
      _state.activeConvId = null;
    }
  }

  function _loadConversations() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.conversations) || '[]');
    } catch (_) {
      return [];
    }
  }

  function _saveConversations() {
    let json = JSON.stringify(_state.conversations);
    while (json.length > MAX_STORAGE_BYTES && _state.conversations.length > 1) {
      const oldest = [..._state.conversations].sort((a, b) => a.updatedAt - b.updatedAt)[0];
      _state.conversations = _state.conversations.filter(c => c.id !== oldest.id);
      if (_state.activeConvId === oldest.id) _state.activeConvId = null;
      json = JSON.stringify(_state.conversations);
    }
    try {
      localStorage.setItem(KEYS.conversations, json);
    } catch (_) {}
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function getApiKey() { return localStorage.getItem(KEYS.apiKey) || ''; }
  function setApiKey(key) { localStorage.setItem(KEYS.apiKey, key.trim()); }

  function getTheme() { return localStorage.getItem(KEYS.theme) || 'dark'; }
  function setTheme(t) {
    localStorage.setItem(KEYS.theme, t);
    document.documentElement.setAttribute('data-theme', t);
  }

  function getModel() { return localStorage.getItem(KEYS.model) || 'auto'; }
  function setModel(m) { localStorage.setItem(KEYS.model, m); }

  function getConversations() { return _state.conversations; }

  function newConversation() {
    const conv = {
      id: uuid(),
      title: 'Cuộc hội thoại mới',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: getModel(),
      messages: []
    };
    _state.conversations.unshift(conv);
    _saveConversations();
    return conv;
  }

  function getActiveConv() {
    return _state.conversations.find(c => c.id === _state.activeConvId) || null;
  }

  function setActiveConv(id) {
    _state.activeConvId = id;
    if (id) localStorage.setItem(KEYS.activeConv, id);
    else localStorage.removeItem(KEYS.activeConv);
  }

  function deleteConversation(id) {
    _state.conversations = _state.conversations.filter(c => c.id !== id);
    if (_state.activeConvId === id) _state.activeConvId = null;
    _saveConversations();
  }

  function clearAllConversations() {
    _state.conversations = [];
    _state.activeConvId = null;
    _saveConversations();
    localStorage.removeItem(KEYS.activeConv);
  }

  function setConversationModel(convId, model) {
    const conv = _state.conversations.find(c => c.id === convId);
    if (conv) {
      conv.model = model;
      _saveConversations();
    }
  }

  function addMessage(convId, message) {
    const conv = _state.conversations.find(c => c.id === convId);
    if (!conv) return;
    conv.messages.push(message);
    conv.updatedAt = Date.now();
    if (conv.messages.length === 1 && message.role === 'user') {
      const text = typeof message.content === 'string' ? message.content : 'Cuộc hội thoại mới';
      conv.title = text.slice(0, 50).trim() || 'Cuộc hội thoại mới';
    }
    _saveConversations();
  }

  function getPendingAttachments() { return _state.pendingAttachments; }
  function addPendingAttachment(att) { _state.pendingAttachments.push(att); }
  function clearPendingAttachments() { _state.pendingAttachments = []; }
  function removePendingAttachment(index) { _state.pendingAttachments.splice(index, 1); }

  function isStreaming() { return _state.streaming; }
  function setStreaming(v) { _state.streaming = v; }

  return {
    load, uuid,
    getApiKey, setApiKey,
    getTheme, setTheme,
    getModel, setModel,
    getConversations, newConversation, getActiveConv, setActiveConv,
    deleteConversation, clearAllConversations, setConversationModel,
    addMessage,
    getPendingAttachments, addPendingAttachment, clearPendingAttachments, removePendingAttachment,
    isStreaming, setStreaming
  };
})();
