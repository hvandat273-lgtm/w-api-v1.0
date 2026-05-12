document.addEventListener('DOMContentLoaded', () => {
  // 1. Load state
  State.load();

  // 2. Apply theme
  Settings.init();

  // 3. Init modules
  Sidebar.init();
  Chat.init();
  FileHandler.init();

  // 4. Model selector
  const modelSel = document.getElementById('model-select');
  const savedModel = State.getModel();
  modelSel.value = [...modelSel.options].some(option => option.value === savedModel) ? savedModel : 'auto';
  State.setModel(modelSel.value);
  modelSel.addEventListener('change', e => State.setModel(e.target.value));

  // 5. Render sidebar + load conversation
  Sidebar.render();
  const active = State.getActiveConv();
  Chat.loadConversation(active ? active.id : null);

  // 6. Global keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('settings-modal');
      if (!modal.classList.contains('hidden')) Settings.close();
    }
  });
});
