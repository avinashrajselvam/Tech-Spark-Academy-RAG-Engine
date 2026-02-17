// ═══════════════════════════════════════════════════════════
// Tech Spark Academy RAG — Frontend Application
// Real-time query interface with streaming SSE responses
// ═══════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── DOM References ──────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const queryInput = $('#query-input');
    const btnSend = $('#btn-send');
    const responseArea = $('#response-area');
    const welcomeScreen = $('#welcome-screen');
    const responseContent = $('#response-content');
    const responseText = $('#response-text');
    const sourcesPanel = $('#sources-panel');
    const sourcesList = $('#sources-list');
    const loadingIndicator = $('#loading-indicator');
    const latencySearch = $('#latency-search');
    const latencyGen = $('#latency-gen');
    const uploadZone = $('#upload-zone');
    const fileInput = $('#file-input');
    const uploadProgress = $('#upload-progress');
    const uploadBar = $('#upload-bar');
    const uploadStatus = $('#upload-status');
    const docList = $('#doc-list');
    const btnRefreshDocs = $('#btn-refresh-docs');

    // Stats
    const statDocs = $('#stat-docs .stat-value');
    const statChunks = $('#stat-chunks .stat-value');
    const statDims = $('#stat-dims .stat-value');

    // ── State ───────────────────────────────────────────────
    let currentMode = 'answer';
    let isProcessing = false;

    // ── Code Auto-Detection Patterns ─────────────────────
    const CODE_RX = [
        /^\s*(def |class |import |from |print\s*\(|if __name__)/m,
        /^\s*(function |const |let |var |console\.|require\(|=>)/m,
        /^\s*(public |private |static |void |int |String |System\.out)/m,
        /^\s*(#include|int main|printf|scanf|cout|cin)/m,
        /^\s*(func |package |fmt\.)/m,
        /^\s*(fn |let mut |use |impl |pub fn)/m,
        /^\s*(<\?php|\$\w+|echo )/m,
        /^\s*(SELECT |INSERT |CREATE |ALTER )/im,
    ];

    function looksLikeCode(text) {
        return CODE_RX.some(rx => rx.test(text));
    }

    // ── Mode Selector ─────────────────────────────────────
    $$('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
        });
    });

    // ── Auto-detect code on paste → switch to Fix mode ───
    queryInput.addEventListener('paste', () => {
        setTimeout(() => {
            const text = queryInput.value.trim();
            if (text.length > 30 && looksLikeCode(text) && currentMode === 'answer') {
                $$('.mode-btn').forEach(b => b.classList.remove('active'));
                const fixBtn = $('#mode-fix');
                if (fixBtn) {
                    fixBtn.classList.add('active');
                    currentMode = 'fix';
                }
            }
            queryInput.style.height = 'auto';
            queryInput.style.height = Math.min(queryInput.scrollHeight, 120) + 'px';
        }, 50);
    });

    // ── Auto-resize textarea ──────────────────────────────
    queryInput.addEventListener('input', () => {
        queryInput.style.height = 'auto';
        queryInput.style.height = Math.min(queryInput.scrollHeight, 120) + 'px';
    });

    // ── Keyboard handling ─────────────────────────────────
    queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendQuery();
        }
    });

    btnSend.addEventListener('click', sendQuery);

    // ── Stop Button ──────────────────────────────────────
    const btnStop = $('#btn-stop');
    let currentAbort = null;

    btnStop.addEventListener('click', () => {
        if (currentAbort) {
            currentAbort.abort();
            currentAbort = null;
        }
    });

    // ── Query Execution ───────────────────────────────────
    async function sendQuery() {
        const query = queryInput.value.trim();
        if (!query || isProcessing) return;

        isProcessing = true;
        btnSend.classList.add('hidden');
        btnStop.classList.remove('hidden');

        // Show loading
        welcomeScreen.classList.add('hidden');
        responseContent.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');

        // Clear previous
        responseText.innerHTML = '';
        sourcesList.innerHTML = '';
        sourcesPanel.classList.add('hidden');
        latencySearch.querySelector('strong').textContent = '…';
        latencyGen.querySelector('strong').textContent = '…';

        currentAbort = new AbortController();

        try {
            const response = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, mode: currentMode, topK: 1 }),
                signal: currentAbort.signal,
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullText = '';
            let firstChunk = true;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(trimmed.slice(6));

                        if (data.type === 'meta') {
                            handleMeta(data);
                        } else if (data.type === 'chunk') {
                            if (firstChunk) {
                                loadingIndicator.classList.add('hidden');
                                responseContent.classList.remove('hidden');
                                firstChunk = false;
                            }
                            fullText += data.text;
                            const now = Date.now();
                            if (!window._lastRender || now - window._lastRender > 40) {
                                renderMarkdown(fullText, true);
                                window._lastRender = now;
                            }
                        } else if (data.type === 'done') {
                            handleDone(data, fullText);
                        } else if (data.type === 'error') {
                            showError(data.message);
                        }
                    } catch {
                        // Skip malformed SSE data
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                loadingIndicator.classList.add('hidden');
                responseContent.classList.remove('hidden');
                const currentText = responseText.textContent;
                if (currentText && currentText.length > 0) {
                    responseText.classList.remove('typing-cursor');
                } else {
                    responseText.innerHTML = '<p style="color: var(--text-tertiary); font-style: italic;">⏹ Generation stopped.</p>';
                }
            } else {
                showError(err.message);
            }
        } finally {
            isProcessing = false;
            currentAbort = null;
            btnStop.classList.add('hidden');
            btnSend.classList.remove('hidden');
            btnSend.disabled = false;
            queryInput.focus();
        }
    }

    // ── Handle retrieval metadata ─────────────────────────
    function handleMeta(data) {
        latencySearch.querySelector('strong').textContent = `${data.totalLatencyMs}ms`;

        if (data.sources && data.sources.length > 0) {
            sourcesPanel.classList.remove('hidden');
            sourcesList.innerHTML = data.sources.map(s => `
        <div class="source-tag">
          <span>${s.filename}</span>
          <span class="source-lines">L${s.lines}</span>
          <span class="source-score">${(s.score * 1000).toFixed(1)}</span>
        </div>
      `).join('');
        }
    }

    // ── Handle generation complete ────────────────────────
    function handleDone(data, fullText) {
        latencyGen.querySelector('strong').textContent = `${data.generationLatencyMs}ms`;
        renderMarkdown(fullText, false);
    }

    // ── Render markdown with Prism syntax highlighting ────
    function renderMarkdown(text, isStreaming) {
        const html = marked.parse(text, {
            breaks: true,
            gfm: true,
        });

        responseText.innerHTML = html;

        if (isStreaming) {
            responseText.classList.add('typing-cursor');
        } else {
            responseText.classList.remove('typing-cursor');
        }

        // Syntax highlight code blocks and add copy buttons
        responseText.querySelectorAll('pre').forEach(pre => {
            const code = pre.querySelector('code');
            if (!code) return;

            Prism.highlightElement(code);

            if (pre.querySelector('.code-block-header')) return;

            const langClass = [...code.classList].find(c => c.startsWith('language-'));
            const lang = langClass ? langClass.replace('language-', '') : 'code';

            const header = document.createElement('div');
            header.className = 'code-block-header';
            header.innerHTML = `
                <span class="code-lang-label">${lang}</span>
                <button class="code-copy-btn" title="Copy code">
                    <span class="copy-icon">📋</span>
                    <span class="copy-label">Copy</span>
                </button>
            `;

            pre.style.position = 'relative';
            pre.insertBefore(header, pre.firstChild);

            const copyBtn = header.querySelector('.code-copy-btn');
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const rawCode = code.textContent;
                navigator.clipboard.writeText(rawCode).then(() => {
                    copyBtn.classList.add('copied');
                    copyBtn.querySelector('.copy-icon').textContent = '✓';
                    copyBtn.querySelector('.copy-label').textContent = 'Copied!';
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.querySelector('.copy-icon').textContent = '📋';
                        copyBtn.querySelector('.copy-label').textContent = 'Copy';
                    }, 2000);
                }).catch(() => {
                    const textarea = document.createElement('textarea');
                    textarea.value = code.textContent;
                    textarea.style.position = 'fixed';
                    textarea.style.left = '-9999px';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    copyBtn.classList.add('copied');
                    copyBtn.querySelector('.copy-icon').textContent = '✓';
                    copyBtn.querySelector('.copy-label').textContent = 'Copied!';
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.querySelector('.copy-icon').textContent = '📋';
                        copyBtn.querySelector('.copy-label').textContent = 'Copy';
                    }, 2000);
                });
            });
        });

        responseArea.scrollTop = responseArea.scrollHeight;
    }

    // ── Show error ────────────────────────────────────────
    function showError(message) {
        loadingIndicator.classList.add('hidden');
        responseContent.classList.remove('hidden');
        responseText.innerHTML = `
      <div style="color: #ff5050; padding: 16px; background: rgba(255,80,80,0.08); border-radius: 10px; border: 1px solid rgba(255,80,80,0.2);">
        <strong>⚠ Error</strong>
        <p style="margin-top: 8px; opacity: 0.85;">${escapeHtml(message)}</p>
      </div>
    `;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── File Upload ───────────────────────────────────────

    uploadZone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'LABEL') fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) uploadFiles(fileInput.files);
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
    });

    async function uploadFiles(files) {
        uploadProgress.classList.remove('hidden');
        uploadBar.style.width = '0%';
        uploadStatus.textContent = `Uploading ${files.length} file(s)...`;

        const formData = new FormData();
        for (const file of files) {
            formData.append('files', file);
        }

        try {
            uploadBar.style.width = '40%';

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            uploadBar.style.width = '80%';

            if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

            const data = await response.json();
            uploadBar.style.width = '100%';

            const ingested = data.results.filter(r => r.status === 'ingested');
            const skipped = data.results.filter(r => r.status === 'skipped');

            let statusText = `✅ ${ingested.length} file(s) ingested`;
            if (skipped.length > 0) statusText += `, ${skipped.length} skipped`;
            uploadStatus.textContent = statusText;

            refreshDocuments();
            refreshStats();
            fileInput.value = '';

            setTimeout(() => {
                uploadProgress.classList.add('hidden');
            }, 3000);
        } catch (err) {
            uploadBar.style.width = '100%';
            uploadBar.style.background = '#ff5050';
            uploadStatus.textContent = `❌ ${err.message}`;
            setTimeout(() => {
                uploadProgress.classList.add('hidden');
                uploadBar.style.background = '';
            }, 4000);
        }
    }

    // ── Document List ─────────────────────────────────────

    async function refreshDocuments() {
        try {
            const response = await fetch('/api/documents');
            const data = await response.json();

            if (data.documents.length === 0) {
                docList.innerHTML = `
          <div class="doc-empty">
            <span class="doc-empty-icon">📂</span>
            <p>No documents yet</p>
            <p class="doc-empty-sub">Upload files to build your knowledge base</p>
          </div>
        `;
                return;
            }

            docList.innerHTML = data.documents.map(doc => `
        <div class="doc-item" data-id="${doc.id}">
          <div class="doc-item-info">
            <span class="doc-lang-badge">${doc.language}</span>
            <span class="doc-name" title="${escapeHtml(doc.filename)}">${escapeHtml(doc.filename)}</span>
            <span class="doc-chunks">${doc.chunks} chunks</span>
          </div>
          <button class="doc-delete" onclick="deleteDocument('${doc.id}')" title="Remove">✕</button>
        </div>
      `).join('');
        } catch (err) {
            console.error('Failed to refresh documents:', err);
        }
    }

    window.deleteDocument = async function (docId) {
        try {
            const response = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Delete failed');
            refreshDocuments();
            refreshStats();
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    btnRefreshDocs.addEventListener('click', () => {
        refreshDocuments();
        refreshStats();
    });

    // ── Stats ─────────────────────────────────────────────

    async function refreshStats() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();

            statDocs.textContent = data.documents;
            statChunks.textContent = data.totalChunks;
            statDims.textContent = data.dimensions || '—';
        } catch (err) {
            console.error('Stats error:', err);
        }
    }

    // ── Initialize ────────────────────────────────────────

    async function init() {
        queryInput.focus();
        refreshDocuments();
        refreshStats();
    }

    init();
})();
