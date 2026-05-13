const FileHandler = (() => {
  const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
  const TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.csv', '.log'];
  const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const TEXT_MIME_TYPES = ['text/plain', 'text/markdown', 'application/json', 'text/csv'];
  const SUPPORTED_FILE_LABEL = 'PNG, JPG, JPEG, WEBP, TXT, MD, JSON, CSV, LOG';

  function init() {
    document.getElementById('img-btn').addEventListener('click', () => {
      document.getElementById('image-input').click();
    });
    document.getElementById('file-btn').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
    document.getElementById('image-input').addEventListener('change', e => handleFiles(e.target.files));
    document.getElementById('file-input').addEventListener('change', e => handleFiles(e.target.files));

    document.addEventListener('paste', e => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) processImage(file);
        }
      }
    });

    const inputArea = document.getElementById('input-area');
    inputArea.addEventListener('dragover', e => {
      e.preventDefault();
      inputArea.style.borderColor = 'var(--accent)';
    });
    inputArea.addEventListener('dragleave', () => {
      inputArea.style.borderColor = '';
    });
    inputArea.addEventListener('drop', e => {
      e.preventDefault();
      inputArea.style.borderColor = '';
      Array.from(e.dataTransfer.files).forEach(file => {
        processFile(file);
      });
    });
  }

  async function handleFiles(fileList) {
    for (const file of Array.from(fileList)) {
      await processFile(file);
    }
    document.getElementById('image-input').value = '';
    document.getElementById('file-input').value = '';
  }

  async function processFile(file) {
    if (isSupportedImageFile(file)) {
      await processImage(file);
      return;
    }
    if (isSupportedTextFile(file)) {
      await processDocFile(file);
      return;
    }
    Toast.show(`File không được hỗ trợ: ${file.name}. Chỉ hỗ trợ ${SUPPORTED_FILE_LABEL}.`, 'error');
  }

  async function processImage(file) {
    if (!isSupportedImageFile(file)) {
      Toast.show(`Ảnh không được hỗ trợ: ${file.name}. Chỉ hỗ trợ PNG, JPG, JPEG, WEBP.`, 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      Toast.show('Ảnh quá lớn (tối đa 20MB)', 'error');
      return;
    }
    try {
      Toast.show(`Đang tải ${file.name}...`, 'info', 2000);
      const [uploaded, dataUrl] = await Promise.all([
        API.uploadFile(file),
        readAsDataUrl(file)
      ]);
      State.addPendingAttachment({
        type: 'image',
        id: uploaded.id,
        filename: uploaded.name,
        mimeType: uploaded.mime_type,
        dataUrl
      });
      renderPreview();
      Toast.show(`Đã tải: ${file.name}`, 'success');
    } catch (err) {
      Toast.show(`Lỗi upload ảnh: ${err.message}`, 'error');
    }
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Không đọc được file.'));
      reader.readAsDataURL(file);
    });
  }

  async function processDocFile(file) {
    if (!isSupportedTextFile(file)) {
      Toast.show(`File không được hỗ trợ: ${file.name}. Chỉ hỗ trợ TXT, MD, JSON, CSV, LOG.`, 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      Toast.show('File quá lớn (tối đa 20MB)', 'error');
      return;
    }

    Toast.show(`Đang tải ${file.name}...`, 'info', 2000);
    try {
      const result = await API.uploadFile(file);
      State.addPendingAttachment({
        type: 'file',
        id: result.id,
        filename: result.name,
        mimeType: result.mime_type,
        size: result.size
      });
      renderPreview();
      Toast.show(`Đã tải: ${file.name}`, 'success');
    } catch (err) {
      Toast.show(`Lỗi upload file: ${err.message}`, 'error');
    }
  }

  function renderPreview() {
    const preview = document.getElementById('attachment-preview');
    const atts = State.getPendingAttachments();
    if (atts.length === 0) {
      preview.innerHTML = '';
      Chat.updateSendBtn?.();
      return;
    }

    preview.innerHTML = atts.map((att, i) => {
      if (att.type === 'image') {
        return `<div class="attachment-preview-item">
          <img src="${att.dataUrl}" alt="${escHtml(att.filename)}" />
          <span>${escHtml(att.filename)}</span>
          <button class="attachment-remove" onclick="FileHandler.removeAttachment(${i})">×</button>
        </div>`;
      }
      return `<div class="attachment-preview-item">
        📄 <span>${escHtml(att.filename)}</span>
        <button class="attachment-remove" onclick="FileHandler.removeAttachment(${i})">×</button>
      </div>`;
    }).join('');
    Chat.updateSendBtn?.();
  }

  function removeAttachment(index) {
    State.removePendingAttachment(index);
    renderPreview();
  }

  function clearPreview() {
    State.clearPendingAttachments();
    renderPreview();
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getExtension(file) {
    return `.${String(file.name || '').split('.').pop()}`.toLowerCase();
  }

  function isSupportedImageFile(file) {
    return IMAGE_MIME_TYPES.includes(file.type) || IMAGE_EXTENSIONS.includes(getExtension(file));
  }

  function isSupportedTextFile(file) {
    return TEXT_MIME_TYPES.includes(file.type) || TEXT_EXTENSIONS.includes(getExtension(file));
  }

  return { init, processImage, processDocFile, removeAttachment, clearPreview };
})();
