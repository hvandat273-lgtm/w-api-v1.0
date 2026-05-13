const Chat = (() => {
  let _currentConvId = null;
  let _jpViMode = false;
  const STREAM_RENDER_INTERVAL_MS = 80;

  const JP_VI_PROMPT = `Bạn là một chuyên gia dịch thuật Nhật - Việt chuyên sâu về lĩnh vực Thiết kế đồ họa/IT/Kỹ thuật. Hãy phân tích hình ảnh tôi cung cấp và dịch theo yêu cầu sau:

Trích xuất văn bản: Đọc chính xác toàn bộ chữ trong ảnh, bao gồm cả văn bản máy, chữ viết tay và các ký hiệu chú thích.

Trình bày song ngữ: Hiển thị kết quả dưới dạng bảng hoặc danh sách theo cấu trúc:

[Tiếng Nhật gốc] -> [Tiếng Việt dịch]

Phân loại khu vực: Chia bản dịch theo từng phần của ảnh (ví dụ: Tiêu đề, Các gạch đầu dòng, Ghi chú viết tay màu đỏ, Tên file...) để tôi dễ theo dõi.

Giải thích thuật ngữ: Nếu có các thuật ngữ chuyên ngành hoặc từ viết tắt khó hiểu, hãy chú thích rõ ý nghĩa kỹ thuật của chúng ở bên dưới.

Hãy giữ nguyên định dạng của các mã số, tên file hoặc thông số kỹ thuật.`;

  const SUGGESTIONS = [
    { icon: '📄', title: 'Tóm tắt tài liệu', desc: 'Upload TXT/MD/JSON/CSV/LOG và hỏi về nội dung', prompt: 'Hãy tóm tắt nội dung tài liệu này cho tôi.' },
    { icon: '🖼️', title: 'Phân tích ảnh', desc: 'Đính kèm ảnh để Gemini đọc và mô tả nội dung', prompt: 'Hãy phân tích ảnh này.' },
    { icon: '💻', title: 'Viết code', desc: 'Giải thích, sửa lỗi hoặc tạo đoạn code', prompt: 'Viết một hàm Python để ' },
    { icon: '✍️', title: 'Soạn thảo văn bản', desc: 'Email, báo cáo, bài viết, nội dung sáng tạo', prompt: 'Hãy giúp tôi viết ' },
  ];

  function init() {
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('jp-vi-btn')?.addEventListener('click', toggleJpViMode);
    document.getElementById('msg-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    document.getElementById('msg-input').addEventListener('input', () => {
      autoResize();
      updateSendBtn();
    });
  }

  function toggleJpViMode() {
    _jpViMode = !_jpViMode;
    const btn = document.getElementById('jp-vi-btn');
    btn.classList.toggle('active', _jpViMode);
    btn.setAttribute('aria-pressed', String(_jpViMode));
    Toast.show(_jpViMode ? 'Đã bật prompt dịch Nhật - Việt' : 'Đã tắt prompt dịch Nhật - Việt', 'info', 1800);
  }

  function autoResize() {
    const ta = document.getElementById('msg-input');
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }

  function updateSendBtn() {
    const hasText = document.getElementById('msg-input').value.trim().length > 0;
    const hasAtt = State.getPendingAttachments().length > 0;
    document.getElementById('send-btn').disabled = !hasText && !hasAtt;
  }

  function showWelcome() {
    const messages = document.getElementById('messages');
    const cardsHtml = SUGGESTIONS.map((s, i) =>
      `<div class="suggestion-card" onclick="Chat.useSuggestion(${i})">
        <span class="card-icon">${s.icon}</span>
        <span class="card-title">${s.title}</span>
        <span class="card-desc">${s.desc}</span>
      </div>`
    ).join('');

    messages.innerHTML = `<div class="welcome">
      <h2>Xin chào!</h2>
      <p class="welcome-sub">Tôi có thể giúp gì cho bạn hôm nay?</p>
      <div class="suggestion-grid">${cardsHtml}</div>
    </div>`;
  }

  function useSuggestion(index) {
    const s = SUGGESTIONS[index];
    if (!s?.prompt) return;
    document.getElementById('msg-input').value = s.prompt;
    autoResize();
    updateSendBtn();
    document.getElementById('msg-input').focus();
  }

  function loadConversation(convId) {
    _currentConvId = convId;
    const messages = document.getElementById('messages');

    if (!convId) {
      showWelcome();
      updateSendBtn();
      return;
    }

    const conv = State.getConversations().find(c => c.id === convId);
    if (!conv) {
      showWelcome();
      return;
    }

    messages.innerHTML = '';
    conv.messages.forEach(msg => appendMessage(msg, false));

    const modelSel = document.getElementById('model-select');
    if (conv.model && [...modelSel.options].some(option => option.value === conv.model)) {
      modelSel.value = conv.model;
    }

    scrollToBottom();
    updateSendBtn();
  }

  function appendMessage(msg, scroll = true) {
    const messages = document.getElementById('messages');
    messages.querySelector('.welcome')?.remove();

    const block = document.createElement('div');
    block.className = `msg-block ${msg.role}`;

    const inner = document.createElement('div');
    inner.className = 'msg-inner';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    if (msg.attachments && msg.attachments.length > 0) {
      const attDiv = document.createElement('div');
      attDiv.className = 'msg-attachments';
      msg.attachments.forEach(att => {
        if (att.type === 'image' && att.dataUrl) {
          const img = document.createElement('img');
          img.src = att.dataUrl;
          img.className = 'msg-image';
          img.alt = att.filename || 'ảnh';
          bubble.appendChild(img);
        } else if (att.filename) {
          const chip = document.createElement('div');
          chip.className = 'attachment-chip';
          chip.innerHTML = `📄 ${escHtml(att.filename)}`;
          attDiv.appendChild(chip);
        }
      });
      if (attDiv.children.length > 0) bubble.appendChild(attDiv);
    }

    const contentDiv = document.createElement('div');
    if (msg.role === 'user') {
      contentDiv.textContent = typeof msg.content === 'string' ? msg.content : '';
    } else {
      contentDiv.innerHTML = Markdown.render(typeof msg.content === 'string' ? msg.content : '');
    }
    bubble.appendChild(contentDiv);
    inner.appendChild(bubble);

    if (msg.role === 'assistant') {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      actions.innerHTML = `<button class="msg-action-btn" onclick="Chat.copyMsg(this)" title="Sao chép">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Sao chép
      </button>`;
      inner.appendChild(actions);
    }

    block.appendChild(inner);
    messages.appendChild(block);
    if (scroll) scrollToBottom();
    return { block, bubble, contentDiv };
  }

  function createStreamingBubble() {
    const messages = document.getElementById('messages');
    messages.querySelector('.welcome')?.remove();

    const block = document.createElement('div');
    block.className = 'msg-block assistant';
    block.id = 'streaming-block';

    const inner = document.createElement('div');
    inner.className = 'msg-inner';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';
    bubble.appendChild(contentDiv);
    inner.appendChild(bubble);
    block.appendChild(inner);
    messages.appendChild(block);
    scrollToBottom();
    return contentDiv;
  }

  async function sendMessage() {
    if (State.isStreaming()) return;
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    const attachments = State.getPendingAttachments();
    if (!text && attachments.length === 0) return;

    if (!_currentConvId) {
      const conv = State.newConversation();
      State.setActiveConv(conv.id);
      _currentConvId = conv.id;
      Sidebar.render();
    }

    const model = document.getElementById('model-select').value;
    State.setModel(model);

    const userMsg = {
      id: State.uuid(),
      role: 'user',
      content: text || 'Hãy phân tích các file đính kèm.',
      attachments: attachments.map(a => ({
        type: a.type,
        filename: a.filename,
        dataUrl: a.type === 'image' ? a.dataUrl : undefined
      })),
      timestamp: Date.now()
    };

    State.addMessage(_currentConvId, userMsg);
    appendMessage(userMsg);

    input.value = '';
    input.style.height = 'auto';
    State.clearPendingAttachments();
    FileHandler.clearPreview();
    updateSendBtn();

    const conv = State.getConversations().find(c => c.id === _currentConvId);
    const apiMessages = conv.messages
      .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }))
      .filter(m => m.content);
    if (_jpViMode) {
      const lastUserMessage = [...apiMessages].reverse().find(m => m.role === 'user');
      if (lastUserMessage) {
        const extraInstruction = userMsg.content && userMsg.content !== 'Hãy phân tích các file đính kèm.'
          ? `\n\nYêu cầu bổ sung của người dùng:\n${userMsg.content}`
          : '';
        lastUserMessage.content = `${JP_VI_PROMPT}${extraInstruction}`;
      }
    }
    const apiAttachments = attachments
      .filter(att => att.id)
      .map(att => ({ id: att.id, name: att.filename, mime_type: att.mimeType }));

    State.setStreaming(true);
    document.getElementById('send-btn').disabled = true;
    const contentDiv = createStreamingBubble();
    let streamingRenderer = null;

    try {
      streamingRenderer = createStreamingRenderer(contentDiv);
      const finalText = await API.chat(apiMessages, model, (accumulated, delta) => {
        streamingRenderer.push(accumulated, delta);
      }, apiAttachments, _currentConvId);

      streamingRenderer.finish(finalText);

      State.addMessage(_currentConvId, {
        id: State.uuid(),
        role: 'assistant',
        content: finalText,
        timestamp: Date.now()
      });
      Sidebar.render();
    } catch (err) {
      streamingRenderer?.cancel();
      contentDiv.className = '';
      contentDiv.innerHTML = `<span style="color:var(--danger)">⚠ ${escHtml(err.message)}</span>`;
      Toast.show(err.message, 'error', 5000);
    } finally {
      State.setStreaming(false);
      document.getElementById('streaming-block')?.removeAttribute('id');
      updateSendBtn();
      scrollToBottom();
    }
  }

  function copyMsg(btn) {
    const bubble = btn.closest('.msg-block').querySelector('.msg-bubble');
    navigator.clipboard.writeText(bubble.innerText).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = btn.innerHTML.replace('Sao chép', 'Đã sao chép!');
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    });
  }

  function scrollToBottom() {
    const messages = document.getElementById('messages');
    messages.scrollTop = messages.scrollHeight;
  }

  function createStreamingRenderer(contentDiv) {
    let fullText = '';
    let pendingText = '';
    let timer = null;
    const textNode = document.createTextNode('');

    contentDiv.className = 'streaming-cursor streaming-text';
    contentDiv.innerHTML = '';
    contentDiv.appendChild(textNode);

    function schedule() {
      if (timer) return;
      timer = setTimeout(flush, STREAM_RENDER_INTERVAL_MS);
    }

    function flush() {
      timer = null;
      if (pendingText) {
        textNode.appendData(pendingText);
        pendingText = '';
      }
      scrollToBottom();
    }

    function setText(text) {
      pendingText = '';
      fullText = text;
      textNode.data = text;
      scrollToBottom();
    }

    function push(accumulated, delta = '') {
      const nextText = typeof accumulated === 'string' ? accumulated : '';
      const deltaText = typeof delta === 'string' ? delta : '';

      if (deltaText && nextText.startsWith(fullText)) {
        const appendedText = nextText.slice(fullText.length);
        if (appendedText) {
          pendingText += appendedText;
          fullText = nextText;
          schedule();
        }
        return;
      }

      if (nextText !== fullText) {
        setText(nextText);
      }
    }

    function finish(finalText) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
      contentDiv.className = '';
      contentDiv.innerHTML = Markdown.render(finalText);
      scrollToBottom();
    }

    function cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pendingText = '';
    }

    return { push, finish, cancel };
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { init, loadConversation, appendMessage, sendMessage, copyMsg, useSuggestion, updateSendBtn };
})();
