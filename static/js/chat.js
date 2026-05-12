const storageKeys = {
  auth: "webchat.authKey",
  conversations: "webchat.conversations"
};

const els = {
  sidebar: document.getElementById("sidebar"),
  menuButton: document.getElementById("menuButton"),
  newChatButton: document.getElementById("newChatButton"),
  searchInput: document.getElementById("searchInput"),
  conversationList: document.getElementById("conversationList"),
  conversationTitle: document.getElementById("conversationTitle"),
  conversationMeta: document.getElementById("conversationMeta"),
  thread: document.getElementById("thread"),
  authKeyInput: document.getElementById("authKeyInput"),
  saveAuthButton: document.getElementById("saveAuthButton"),
  fileInput: document.getElementById("fileInput"),
  attachButton: document.getElementById("attachButton"),
  fileChips: document.getElementById("fileChips"),
  statusLine: document.getElementById("statusLine"),
  composer: document.getElementById("composer"),
  messageInput: document.getElementById("messageInput"),
  sendButton: document.getElementById("sendButton")
};

let state = loadState();
let activeId = state.conversations[0]?.id || createConversation().id;
let pendingFiles = [];
let sending = false;

els.authKeyInput.value = localStorage.getItem(storageKeys.auth) || "";
render();

els.menuButton.addEventListener("click", () => els.sidebar.classList.toggle("open"));
els.newChatButton.addEventListener("click", () => {
  activeId = createConversation().id;
  pendingFiles = [];
  saveState();
  render();
});
els.searchInput.addEventListener("input", renderConversationList);
els.saveAuthButton.addEventListener("click", () => {
  localStorage.setItem(storageKeys.auth, els.authKeyInput.value.trim());
  setStatus("App key saved.", false);
});
els.attachButton.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", uploadSelectedFiles);
els.composer.addEventListener("submit", sendMessage);
els.messageInput.addEventListener("input", resizeComposer);
els.messageInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.composer.requestSubmit();
  }
});

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKeys.conversations) || "[]");
    return { conversations: Array.isArray(parsed) ? parsed : [] };
  } catch {
    return { conversations: [] };
  }
}

function saveState() {
  localStorage.setItem(storageKeys.conversations, JSON.stringify(state.conversations));
}

function createConversation() {
  const conversation = {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    updatedAt: new Date().toISOString()
  };
  state.conversations.unshift(conversation);
  return conversation;
}

function currentConversation() {
  let conversation = state.conversations.find(item => item.id === activeId);
  if (!conversation) {
    conversation = createConversation();
    activeId = conversation.id;
  }
  return conversation;
}

function render() {
  renderConversationList();
  renderThread();
  renderFileChips();
  resizeComposer();
}

function renderConversationList() {
  const query = els.searchInput.value.trim().toLowerCase();
  els.conversationList.innerHTML = "";
  state.conversations
    .filter(item => item.title.toLowerCase().includes(query))
    .forEach(item => {
      const row = document.createElement("div");
      row.className = `conversation-item${item.id === activeId ? " active" : ""}`;
      row.innerHTML = `
        <div class="conversation-name"></div>
        <button class="tiny-button" type="button" aria-label="Rename">✎</button>
        <button class="tiny-button" type="button" aria-label="Delete">×</button>
        <div class="conversation-time">${formatTime(item.updatedAt)}</div>
      `;
      row.querySelector(".conversation-name").textContent = item.title;
      row.addEventListener("click", () => {
        activeId = item.id;
        pendingFiles = [];
        els.sidebar.classList.remove("open");
        render();
      });
      row.querySelector("[aria-label='Rename']").addEventListener("click", event => {
        event.stopPropagation();
        const nextTitle = prompt("Rename chat", item.title);
        if (nextTitle && nextTitle.trim()) {
          item.title = nextTitle.trim().slice(0, 90);
          item.updatedAt = new Date().toISOString();
          saveState();
          render();
        }
      });
      row.querySelector("[aria-label='Delete']").addEventListener("click", event => {
        event.stopPropagation();
        state.conversations = state.conversations.filter(conversation => conversation.id !== item.id);
        activeId = state.conversations[0]?.id || createConversation().id;
        saveState();
        render();
      });
      els.conversationList.appendChild(row);
    });
}

function renderThread() {
  const conversation = currentConversation();
  els.conversationTitle.textContent = conversation.title;
  els.conversationMeta.textContent = `${conversation.messages.length} messages`;
  els.thread.innerHTML = "";

  if (!conversation.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<h2>How can I help?</h2>";
    els.thread.appendChild(empty);
    return;
  }

  conversation.messages.forEach(message => {
    const row = document.createElement("article");
    row.className = `message-row ${message.role}`;
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = message.role === "assistant" ? "✦" : "You".slice(0, 1);
    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = message.content;
    if (message.attachments?.length) {
      const files = document.createElement("div");
      files.className = "message-files";
      message.attachments.forEach(file => files.appendChild(makeChip(file.name, null)));
      body.appendChild(files);
    }
    row.append(avatar, body);
    els.thread.appendChild(row);
  });

  els.thread.scrollTop = els.thread.scrollHeight;
}

function renderFileChips() {
  els.fileChips.innerHTML = "";
  pendingFiles.forEach(file => {
    els.fileChips.appendChild(makeChip(file.name, () => {
      pendingFiles = pendingFiles.filter(item => item.id !== file.id);
      renderFileChips();
    }));
  });
}

function makeChip(label, onRemove) {
  const chip = document.createElement("div");
  chip.className = "file-chip";
  const text = document.createElement("span");
  text.textContent = label;
  chip.appendChild(text);
  if (onRemove) {
    const remove = document.createElement("button");
    remove.className = "tiny-button";
    remove.type = "button";
    remove.textContent = "×";
    remove.addEventListener("click", onRemove);
    chip.appendChild(remove);
  }
  return chip;
}

async function uploadSelectedFiles() {
  const files = [...els.fileInput.files];
  els.fileInput.value = "";
  if (!files.length) return;
  const authKey = currentAuthKey();
  if (!authKey) {
    setStatus("Enter and save the app key first.", true);
    return;
  }

  for (const file of files) {
    const form = new FormData();
    form.append("upload", file);
    setStatus(`Uploading ${file.name}...`, false);
    try {
      const response = await fetch("/api/chat/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${authKey}` },
        body: form
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.detail || "Upload failed.");
      pendingFiles.push(data);
      setStatus("", false);
      renderFileChips();
    } catch (error) {
      setStatus(error.message, true);
    }
  }
}

async function sendMessage(event) {
  event.preventDefault();
  if (sending) return;

  const authKey = currentAuthKey();
  const content = els.messageInput.value.trim();
  if (!authKey) {
    setStatus("Enter and save the app key first.", true);
    return;
  }
  if (!content && pendingFiles.length === 0) return;

  const conversation = currentConversation();
  const userMessage = { role: "user", content: content || "Please review the attached files.", attachments: pendingFiles };
  conversation.messages.push(userMessage);
  if (conversation.title === "New chat") conversation.title = userMessage.content.slice(0, 48);
  conversation.updatedAt = new Date().toISOString();
  const filesToSend = [...pendingFiles];
  pendingFiles = [];
  els.messageInput.value = "";
  saveState();
  render();

  sending = true;
  setBusy(true);
  setStatus("Sending...", false);
  try {
    const response = await fetch("/api/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        conversation_id: conversation.id,
        messages: conversation.messages
          .filter(message => message.role === "user" || message.role === "assistant")
          .map(message => ({ role: message.role, content: message.content })),
        attachments: filesToSend,
        stream: false
      })
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.detail || "Chat request failed.");
    conversation.messages.push(data.message);
    conversation.updatedAt = new Date().toISOString();
    setStatus("", false);
  } catch (error) {
    conversation.messages.push({ role: "assistant", content: `Error: ${error.message}` });
    conversation.updatedAt = new Date().toISOString();
    setStatus(error.message, true);
  } finally {
    sending = false;
    setBusy(false);
    saveState();
    render();
  }
}

function currentAuthKey() {
  return (localStorage.getItem(storageKeys.auth) || els.authKeyInput.value || "").trim();
}

function setBusy(isBusy) {
  els.sendButton.disabled = isBusy;
  els.attachButton.disabled = isBusy;
}

function setStatus(message, isError) {
  els.statusLine.textContent = message;
  els.statusLine.classList.toggle("error", Boolean(isError));
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function resizeComposer() {
  els.messageInput.style.height = "0px";
  els.messageInput.style.height = `${Math.min(190, els.messageInput.scrollHeight)}px`;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
