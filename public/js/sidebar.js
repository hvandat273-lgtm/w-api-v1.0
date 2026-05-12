const Sidebar = (() => {
  function init() {
    document.getElementById('new-chat-icon-btn').addEventListener('click', newChat);
    document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
  }

  function render() {
    const list = document.getElementById('conv-list');
    const convs = State.getConversations();
    const activeId = State.getActiveConv()?.id;

    if (convs.length === 0) {
      list.innerHTML = '';
      return;
    }

    const now = Date.now();
    const groups = { today: [], yesterday: [], week: [], older: [] };
    convs.forEach(conv => {
      const diff = now - conv.updatedAt;
      if (diff < 86400000) groups.today.push(conv);
      else if (diff < 172800000) groups.yesterday.push(conv);
      else if (diff < 604800000) groups.week.push(conv);
      else groups.older.push(conv);
    });

    const labels = { today: 'Hôm nay', yesterday: 'Hôm qua', week: 'Tuần này', older: 'Cũ hơn' };
    let html = '';
    for (const key of ['today', 'yesterday', 'week', 'older']) {
      if (groups[key].length === 0) continue;
      html += `<div class="conv-section-label">${labels[key]}</div>`;
      groups[key].forEach(conv => {
        const active = conv.id === activeId ? 'active' : '';
        html += `<div class="conv-item ${active}" data-id="${conv.id}" onclick="Sidebar.loadConv('${conv.id}')">
          <div class="conv-title">${escHtml(conv.title)}</div>
          <button class="conv-delete icon-btn" onclick="Sidebar.deleteConv(event,'${conv.id}')" title="Xóa">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/></svg>
          </button>
        </div>`;
      });
    }
    list.innerHTML = html;
  }

  function newChat() {
    if (State.isStreaming()) return;
    const conv = State.newConversation();
    State.setActiveConv(conv.id);
    render();
    Chat.loadConversation(conv.id);
  }

  function loadConv(id) {
    if (State.isStreaming()) return;
    State.setActiveConv(id);
    render();
    Chat.loadConversation(id);
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.add('collapsed');
    }
  }

  function deleteConv(e, id) {
    e.stopPropagation();
    State.deleteConversation(id);
    const active = State.getActiveConv();
    render();
    if (!active || active.id === id) {
      const convs = State.getConversations();
      if (convs.length > 0) {
        State.setActiveConv(convs[0].id);
        Chat.loadConversation(convs[0].id);
      } else {
        Chat.loadConversation(null);
      }
    }
  }

  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, render, newChat, loadConv, deleteConv };
})();
