const Markdown = (() => {
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });

    const renderer = new marked.Renderer();
    renderer.code = function(token) {
      const lang = (token.lang || '').toLowerCase();
      const code = token.text;
      let highlighted = code;

      if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(code, { language: lang }).value;
        } catch (_) {}
      } else if (typeof hljs !== 'undefined') {
        try {
          highlighted = hljs.highlightAuto(code).value;
        } catch (_) {}
      }

      const escapedCode = code.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      return `<div class="code-block-wrap">
        <div class="code-block-header">
          <span>${lang || 'code'}</span>
          <button class="copy-code-btn" onclick="Markdown.copyCode(this)" data-code="${escapedCode}">Sao chép</button>
        </div>
        <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
      </div>`;
    };

    marked.use({ renderer });
  }

  function render(text) {
    if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
    try {
      return marked.parse(text);
    } catch (_) {
      return escapeHtml(text).replace(/\n/g, '<br>');
    }
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function copyCode(btn) {
    const code = btn.dataset.code
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = 'Đã sao chép!';
      setTimeout(() => { btn.textContent = 'Sao chép'; }, 2000);
    });
  }

  return { render, copyCode };
})();
