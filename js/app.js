// app.js
const App = (function () {
// 状态管理
    let blocks = [];
    let sortableInstance = null; // SortableJS 实例

    // 历史记录管理（撤销/重做）
    let undoStack = [];
    let redoStack = [];
    const MAX_HISTORY = 50;

    // 设置管理
    let settings = {
        autosaveInterval: 300,
        showTokenCount: true,
        confirmBeforeClear: true,
        customPresets: []
    };
    let debouncedGenerate = null;

    // DOM 元素缓存
    let DOM = {};

    function initDOM() {
        DOM = {
            blocksContainer: document.getElementById('blocks-container'),
            outputArea: document.getElementById('output-area'),
            tokenDisplay: document.getElementById('token-display'),
            promptInput: document.getElementById('prompt-input'),
            toast: document.getElementById('toast'),
            fileInput: document.getElementById('file-input'),
            dirInput: document.getElementById('dir-input'),
            dropZone: document.getElementById('file-drop-zone'),
            config: {
                globalStart: document.getElementById('use-global-start'),
                startText: document.getElementById('cfg-start'),
                globalEnd: document.getElementById('use-global-end'),
                endText: document.getElementById('cfg-end'),
                fileTpl: document.getElementById('cfg-file-tpl'),
                promptTpl: document.getElementById('cfg-prompt-tpl')
            }
        };
    }

    // 初始化逻辑
    document.addEventListener('DOMContentLoaded', () => {
        initDOM();
        loadSettings(); // 加载设置
        loadTheme();
        loadFromLocal();
        bindEvents();
        renderBlocks();
        updateUndoRedoButtons(); // Initialize button states
    });

    // ---------------- 主题切换 ----------------
    function loadTheme() {
        const saved = localStorage.getItem('promptBlocksTheme');
        let isDark;
        if (saved !== null) {
            isDark = saved === 'dark';
        } else {
            // 尊重系统偏好
            isDark = !window.matchMedia('(prefers-color-scheme: light)').matches;
        }
        setTheme(isDark);
    }

    function setTheme(isDark) {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        const toggle = document.getElementById('theme-toggle');
        if (toggle) toggle.checked = isDark;
        localStorage.setItem('promptBlocksTheme', isDark ? 'dark' : 'light');
    }

    // ---------------- 估计Token数 ----------------
    // 使用基于字符的估算，无需外部依赖
    // cl100k_base编码：英文约4字符/token，中文约1.5字符/token
    function estimateTokens(text) {
        if (!text) return 0;
        
        let tokens = 0;
        const words = text.split(/\s+/);
        for (const word of words) {
            if (/^[\x00-\x7F]+$/.test(word)) {
                // 纯ASCII/英文 - 约4字符/token
                tokens += Math.ceil(word.length / 4);
            } else {
                // 包含非ASCII（中文等）- 约1.5字符/token
                tokens += Math.ceil(word.length / 1.5);
            }
        }
        
        // 空格/换行符额外估算
        const whitespaces = (text.match(/\s+/g) || []).length;
        tokens += whitespaces * 0.5;
        
        return Math.max(1, Math.round(tokens));
    }

    // 历史记录管理
    function pushHistory() {
        const state = JSON.parse(JSON.stringify(blocks));
        undoStack.push(state);
        if (undoStack.length > MAX_HISTORY) {
            undoStack.shift();
        }
        redoStack = []; // 新操作清空 redo 栈
        updateUndoRedoButtons();
    }

    function updateUndoRedoButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) undoBtn.disabled = undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    }

    function undo() {
        if (undoStack.length === 0) return;
        const currentState = JSON.parse(JSON.stringify(blocks));
        redoStack.push(currentState);
        blocks = undoStack.pop();
        updateUndoRedoButtons();
        renderBlocks();
    }

    function redo() {
        if (redoStack.length === 0) return;
        const currentState = JSON.parse(JSON.stringify(blocks));
        undoStack.push(currentState);
        blocks = redoStack.pop();
        updateUndoRedoButtons();
        renderBlocks();
    }

    // 键盘快捷键处理
    function handleKeyboardShortcuts(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

        // Ctrl+S: 导出文件（阻止默认行为）
        if (ctrlKey && e.key === 's') {
            e.preventDefault();
            exportToFile();
            return;
        }

        // Ctrl+Z: 撤销
        if (ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
        }

        // Ctrl+Y 或 Ctrl+Shift+Z: 重做
        if ((ctrlKey && e.key === 'y') || (ctrlKey && e.shiftKey && e.key === 'z')) {
            e.preventDefault();
            redo();
            return;
        }

        // Ctrl+Enter: 添加当前输入为 block
        if (ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            addPromptBlock();
            return;
        }
    }

    function bindEvents() {
        document.getElementById('btn-add-block').addEventListener('click', addPromptBlock);
        document.getElementById('btn-import-file').addEventListener('click', () => DOM.fileInput.click());

        // 点击上传
        DOM.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) processFiles(Array.from(e.target.files));
            e.target.value = '';
        });

        // Directory picker
        document.getElementById('btn-import-dir').addEventListener('click', () => DOM.dirInput.click());

        DOM.dirInput.addEventListener('change', (e) => {
            if (e.target.files.length) processFiles(Array.from(e.target.files));
            e.target.value = '';
        });

        // 拖拽文件上传 (Drop Zone)
        DOM.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            DOM.dropZone.classList.add('dragover');
        });
        DOM.dropZone.addEventListener('dragleave', () => {
            DOM.dropZone.classList.remove('dragover');
        });
        DOM.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            DOM.dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                processFiles(Array.from(e.dataTransfer.files));
            }
        });

        document.getElementById('btn-copy').addEventListener('click', copyToClipboard);
        document.getElementById('btn-export').addEventListener('click', exportProject);
        document.getElementById('btn-import-project').addEventListener('click', importProject);
        document.getElementById('btn-clear').addEventListener('click', clearAll);

        // 绑定配置项防抖更新
        Object.values(DOM.config).forEach(el => {
            el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
                if (debouncedGenerate) debouncedGenerate();
            });
        });

        // 绑定键盘快捷键
        document.addEventListener('keydown', handleKeyboardShortcuts);
    }

    function initSortable() {
        if (sortableInstance) {
            sortableInstance.destroy();
        }
        // 使用 SortableJS 实现丝滑拖拽
        sortableInstance = new Sortable(DOM.blocksContainer, {
            animation: 150,
            handle: '.drag-handle', // 只有拖拽图标才能触发拖拽
            ghostClass: 'sortable-ghost', // 拖拽时的虚影样式
            dragClass: 'sortable-drag',
            onEnd: function (evt) {
                if (evt.oldIndex === evt.newIndex) return;
                pushHistory(); // Record state after reorder
                // 更新底层数据数组，保持与 DOM 一致
                const movedItem = blocks.splice(evt.oldIndex, 1)[0];
                blocks.splice(evt.newIndex, 0, movedItem);
                generateOutput();
            }
        });
    }

function addPromptBlock() {
        const val = DOM.promptInput.value.trim();
        if (!val) return showToast("请输入内容后再添加", true);

        pushHistory();
        blocks.push({
            id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
            type: 'prompt',
            name: 'Instruction Block',
            content: val,
            showTitle: true,
            customTpl: ''
        });
        DOM.promptInput.value = '';
        renderBlocks();
    }

    function processFiles(files) {
        const textExts = ['.txt', '.md', '.js', '.ts', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.sh', '.sql'];
        const isTextFile = (fname) => {
            const lower = fname.toLowerCase();
            return textExts.some(ext => lower.endsWith(ext)) || lower.match(/\.(txt|md|js|ts|html|css|json|xml|yaml|yml|py|go|rs|java|c|cpp|h|sh|sql)$/i);
        };

        let loadedCount = 0;
        let errorCount = 0;
        let skipCount = 0;
        files.forEach(file => {
            if (!isTextFile(file.name)) {
                skipCount++;
                if (loadedCount + errorCount + skipCount === files.length) {
                    finishImport();
                }
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                pushHistory();
                blocks.push({
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                    type: 'file',
                    name: file.webkitRelativePath || file.name,
                    content: ev.target.result,
                    showTitle: true,
                    customTpl: ''
                });
                loadedCount++;
                if (loadedCount + errorCount + skipCount === files.length) {
                    finishImport();
                }
            };
            reader.onerror = () => {
                errorCount++;
                if (loadedCount + errorCount + skipCount === files.length) {
                    finishImport();
                }
            };
            reader.readAsText(file);
        });

        function finishImport() {
            if (loadedCount + errorCount === 0) {
                showToast("没有可导入的文本文件", true);
                return;
            }
            pushHistory(); // Record state after files loaded
            renderBlocks();
            if (errorCount > 0) {
                showToast(`导入完成：${loadedCount} 成功，${errorCount} 失败${skipCount > 0 ? `，跳过 ${skipCount} 个非文本文件` : ''}`, true);
            } else if (skipCount > 0) {
                showToast(`成功导入 ${loadedCount} 个文件（跳过 ${skipCount} 个非文本文件）`);
            } else {
                showToast(`成功导入 ${loadedCount} 个文件`);
            }
        }
    }

// HTML 转义函数 - 防止 XSS
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderBlocks() {
    // Update block count
    const countEl = document.getElementById('block-count');
    if (countEl) countEl.textContent = blocks.length;

    if (blocks.length === 0) {
        DOM.blocksContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-text">暂无代码块</div>
                <div class="empty-state-hint">在上方输入内容或拖拽文件来添加</div>
            </div>
        `;
        initSortable();
        generateOutput();
        return;
    }

    let htmlStr = '';
    // 注意：这里的操作全部改为基于 block.id，防止拖拽后索引错位
    blocks.forEach((block) => {
        // 安全转义用户数据
        const safeName = escapeHtml(block.name);
        const safeCustomTpl = escapeHtml(block.customTpl);
        htmlStr += `
            <div class="block" data-id="${block.id}">
                <div class="block-header-ui">
                    <div class="drag-handle" title="拖拽排序">⠿</div>
                    <div class="block-info">
                        <div class="block-meta">
                            <span class="tag ${block.type === 'file' ? 'tag-file' : 'tag-prompt'}">${block.type}</span>
                            <span class="block-name">${safeName}</span>
                        </div>
                    </div>
                    <button class="btn btn-icon btn-secondary" onclick="App.toggleSettings('${block.id}')" title="设置">⚙️</button>
                    <button class="btn btn-icon btn-danger-ghost" onclick="App.removeBlock('${block.id}')" title="删除">✕</button>
                </div>
                <div class="block-settings" id="settings-${block.id}">
                    <div class="block-setting-row">
                        <label class="switch">
                            <input type="checkbox" ${block.showTitle ? 'checked' : ''} onchange="App.updateBlockConfig('${block.id}', 'showTitle', this.checked)">
                            <span class="slider"></span>
                        </label>
                        <span class="block-setting-label">显示标题</span>
                    </div>
                    <input type="text" class="block-template-input" id="custom-tpl-${block.id}" value="${safeCustomTpl}" placeholder="覆盖默认模板..." oninput="App.updateBlockConfig('${block.id}', 'customTpl', this.value)">
                    <div class="preset-tags">
                        <span class="preset-label">快捷预设:</span>
                        <span class="tag tag-preset" onclick="App.applyPreset('${block.id}', '--- INSTRUCTION ---')">Instruction</span>
                        <span class="tag tag-preset" onclick="App.applyPreset('${block.id}', '--- CONTEXT ---')">Context</span>
                        <span class="tag tag-preset" onclick="App.applyPreset('${block.id}', '--- SPECIFICATION ---')">Spec</span>
                        <span class="tag tag-preset" onclick="App.applyPreset('${block.id}', '--- FILE: {{name}} ---')">File</span>
                    </div>
                </div>
            </div>
        `;
    });
    DOM.blocksContainer.innerHTML = htmlStr;
    initSortable();
    generateOutput();
}

// 应用快捷预设标签
function applyPreset(id, text) {
    document.getElementById(`custom-tpl-${id}`).value = text;
    updateBlockConfig(id, 'customTpl', text);
}

// ---------------- 核心与其他逻辑 ----------------

function toggleSettings(id) {
        document.getElementById(`settings-${id}`).classList.toggle('active');
    }

    function updateBlockConfig(id, k, v) {
        const block = blocks.find(b => b.id === id);
        if (block) {
            block[k] = v;
            debouncedGenerate();
        }
    }

    function removeBlock(id) {
        pushHistory(); // Record state before change
        blocks = blocks.filter(b => b.id !== id);
        renderBlocks();
        showToast("代码块已移除", true);
    }

    function generateOutput() {
        let res = "";
        if (DOM.config.globalStart.checked && DOM.config.startText.value.trim()) {
            res += DOM.config.startText.value + "\n\n";
        }
        blocks.forEach(b => {
            if (b.showTitle) {
                let defaultTpl = b.type === 'file' ? DOM.config.fileTpl.value : DOM.config.promptTpl.value;
                let tpl = b.customTpl || defaultTpl;
                res += tpl.replace('{{name}}', b.name) + "\n";
            }
            res += b.content + "\n\n";
        });
        if (DOM.config.globalEnd.checked && DOM.config.endText.value.trim()) {
            res += DOM.config.endText.value;
        }

        const final = res.trim();
        DOM.outputArea.value = final;

        calculateTokens(final);
        saveToLocal();
    }

    function createDebouncedGenerate() {
        return debounce(generateOutput, settings.autosaveInterval || 300);
    }

    function updateDebouncedGenerate() {
        debouncedGenerate = createDebouncedGenerate();
    }

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function calculateTokens(text) {
        if (!text) { if (settings.showTokenCount) DOM.tokenDisplay.innerText = "Tokens: 0"; return; }
        const estimated = estimateTokens(text);
        if (settings.showTokenCount) DOM.tokenDisplay.innerText = `Tokens: ~${estimated.toLocaleString()}`;
    }

    function copyToClipboard() {
        if (!DOM.outputArea.value) return showToast("没有可复制的内容", true);
        navigator.clipboard.writeText(DOM.outputArea.value).then(() => {
            showToast("已成功复制到剪贴板！");
        }).catch(() => showToast("复制失败，请手动选择复制", true));
    }

    function exportToFile() {
        const content = DOM.outputArea.value;
        if (!content) return showToast("没有可导出的内容", true);

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PromptBlocks_${new Date().getTime()}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast("文件导出成功！");
    }

    function exportProject() {
        if (blocks.length === 0) return showToast("没有可导出的内容", true);

        const projectData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            blocks: blocks,
            config: {
                useGlobalStart: DOM.config.globalStart.checked,
                startText: DOM.config.startText.value,
                useGlobalEnd: DOM.config.globalEnd.checked,
                endText: DOM.config.endText.value,
                fileTpl: DOM.config.fileTpl.value,
                promptTpl: DOM.config.promptTpl.value
            }
        };

        const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PromptBlocks_${new Date().getTime()}.promptblocks`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast("项目导出成功！");
    }

    function importProject() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.promptblocks,application/json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);

                    // 验证 JSON schema
                    if (!data.version) {
                        return showToast("无效的项目文件：缺少 version 字段", true);
                    }
                    if (data.version > 1) {
                        return showToast(`不支持的项目版本：v${data.version}，请更新应用`, true);
                    }
                    if (!Array.isArray(data.blocks)) {
                        return showToast("无效的项目文件：blocks 字段格式错误", true);
                    }

                    // 确认覆盖
                    const confirmMsg = blocks.length > 0
                        ? "导入将覆盖当前所有数据，确定继续吗？"
                        : "确定要导入此项目吗？";
                    if (!confirm(confirmMsg)) return;

                    // 恢复数据
                    blocks = data.blocks;
                    if (data.config) {
                        DOM.config.globalStart.checked = data.config.useGlobalStart ?? true;
                        DOM.config.startText.value = data.config.startText || "=== PROMPT START ===";
                        DOM.config.globalEnd.checked = data.config.useGlobalEnd ?? true;
                        DOM.config.endText.value = data.config.endText || "=== PROMPT END ===";
                        DOM.config.fileTpl.value = data.config.fileTpl || "--- FILE: {{name}} ---";
                        DOM.config.promptTpl.value = data.config.promptTpl || "--- INSTRUCTION ---";
                    }

                    renderBlocks();
                    showToast("项目导入成功！");
                } catch (err) {
                    showToast("读取项目文件失败：" + err.message, true);
                }
            };
            reader.onerror = () => showToast("读取文件失败", true);
            reader.readAsText(file);
        };
        input.click();
    }

    function clearAll() {
        if (blocks.length === 0) return;
        const confirmMsg = '确定要清空所有已添加的代码块和输入吗？此操作不可恢复。';
        if (!settings.confirmBeforeClear || confirm(confirmMsg)) {
            blocks = [];
            renderBlocks();
            showToast("工作区已清空");
        }
    }

    let toastTimeout;
    function showToast(msg, isError = false) {
        DOM.toast.innerText = msg;
        DOM.toast.style.background = isError ? "var(--danger)" : "var(--accent)";
        DOM.toast.style.color = isError ? "#fff" : "#000";
        DOM.toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => DOM.toast.classList.remove('show'), 2500);
    }

    function getLocalStorageUsage() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length * 2; // UTF-16 字符大小
            }
        }
        return total;
    }

    function checkLocalStorageQuota() {
        const used = getLocalStorageUsage();
        const max = 5 * 1024 * 1024; // 5MB 保守估计
        const usagePercent = (used / max) * 100;
        if (usagePercent > 80) {
            showToast(`LocalStorage 使用率 ${Math.round(usagePercent)}%，建议清理或导出数据`, true);
        }
        return usagePercent > 100;
    }

    function saveToLocal() {
        const state = {
            blocks,
            config: {
                useGlobalStart: DOM.config.globalStart.checked,
                startText: DOM.config.startText.value,
                useGlobalEnd: DOM.config.globalEnd.checked,
                endText: DOM.config.endText.value,
                fileTpl: DOM.config.fileTpl.value,
                promptTpl: DOM.config.promptTpl.value
            }
        };
        try {
            if (checkLocalStorageQuota()) {
                showToast("LocalStorage 配额已满，无法保存", true);
                return;
            }
            localStorage.setItem('promptBlocksState', JSON.stringify(state));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_FILE_CORRUPTED') {
                showToast("LocalStorage 配额已满，数据无法保存", true);
            } else {
                showToast("保存数据失败: " + e.message, true);
            }
        }
    }

    function loadFromLocal() {
        try {
            const saved = localStorage.getItem('promptBlocksState');
            if (saved) {
                const state = JSON.parse(saved);
                blocks = state.blocks || [];
                if (state.config) {
                    DOM.config.globalStart.checked = state.config.useGlobalStart ?? true;
                    DOM.config.startText.value = state.config.startText || "=== PROMPT START ===";
                    DOM.config.globalEnd.checked = state.config.useGlobalEnd ?? true;
                    DOM.config.endText.value = state.config.endText || "=== PROMPT END ===";
                    DOM.config.fileTpl.value = state.config.fileTpl || "--- FILE: {{name}} ---";
                    DOM.config.promptTpl.value = state.config.promptTpl || "--- INSTRUCTION ---";
                }
            }
        } catch (e) {
            console.error("加载本地存储失败", e);
        }
    }

    // ---------------- Settings Modal ----------------

    function openSettings() {
        const modal = document.getElementById('settings-modal');
        if (!modal) return;

        // 加载当前设置到表单
        document.getElementById('cfg-autosave-interval').value = settings.autosaveInterval || 300;
        document.getElementById('cfg-autosave-interval-display').textContent = (settings.autosaveInterval || 300) + 'ms';
        document.getElementById('cfg-show-token-count').checked = settings.showTokenCount !== false;
        document.getElementById('cfg-confirm-clear').checked = settings.confirmBeforeClear !== false;

        // 绑定 range 滑动显示
        document.getElementById('cfg-autosave-interval').addEventListener('input', function() {
            document.getElementById('cfg-autosave-interval-display').textContent = this.value + 'ms';
        });

        // 渲染自定义预设
        renderPresetList();

        modal.classList.add('show');
    }

    function closeSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.classList.remove('show');
    }

    function saveSettings() {
        settings.autosaveInterval = parseInt(document.getElementById('cfg-autosave-interval').value, 10) || 300;
        settings.showTokenCount = document.getElementById('cfg-show-token-count').checked;
        settings.confirmBeforeClear = document.getElementById('cfg-confirm-clear').checked;

        // 更新 debounce 间隔
        updateDebouncedGenerate();

        // 保存到 localStorage
        localStorage.setItem('promptBlocksSettings', JSON.stringify(settings));

        closeSettings();
        showToast('设置已保存');
    }

    function loadSettings() {
        try {
            const saved = localStorage.getItem('promptBlocksSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                settings = {
                    autosaveInterval: parsed.autosaveInterval || 300,
                    showTokenCount: parsed.showTokenCount !== false,
                    confirmBeforeClear: parsed.confirmBeforeClear !== false,
                    customPresets: parsed.customPresets || []
                };
            }
        } catch (e) {
            console.error('加载设置失败', e);
        }
        updateDebouncedGenerate();
    }

    function renderPresetList() {
        const list = document.getElementById('preset-list');
        if (!list) return;

        const allPresets = [
            { name: '--- INSTRUCTION ---', isDefault: true },
            { name: '--- CONTEXT ---', isDefault: true },
            { name: '--- SPECIFICATION ---', isDefault: true },
            { name: '--- EXAMPLES ---', isDefault: true },
            { name: '--- FILE: {{name}} ---', isDefault: true },
            ...settings.customPresets.map((p, i) => ({ ...p, isDefault: false, index: i }))
        ];

        list.innerHTML = allPresets.map((p, i) => `
            <div class="preset-item" data-index="${i}" data-custom="${!p.isDefault}">
                ${p.isDefault ? `
                    <span class="preset-text" style="color: var(--text-primary);">${escapeHtml(p.name)}</span>
                ` : `
                    <input type="text" value="${escapeHtml(p.name)}" placeholder="模板名称" 
                           onchange="App.updateCustomPreset(${p.index}, 'name', this.value)">
                `}
                ${!p.isDefault ? `
                    <button class="preset-delete" onclick="App.deleteCustomPreset(${p.index})">✕</button>
                ` : '<span style="width: 28px;"></span>'}
            </div>
        `).join('');
    }

    function addCustomPreset() {
        settings.customPresets.push({ name: '--- NEW TEMPLATE ---' });
        renderPresetList();
        showToast('已添加新模板，请在右侧输入自定义内容');
    }

    function deleteCustomPreset(index) {
        settings.customPresets.splice(index, 1);
        renderPresetList();
        showToast('已删除自定义模板');
    }

    function updateCustomPreset(index, field, value) {
        if (settings.customPresets[index]) {
            settings.customPresets[index][field] = value;
        }
    }

    // Tab 切换
    function switchTab(tabName) {
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelector(`.modal-tab[onclick="App.switchTab('${tabName}')"]`).classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
        if (tabName === 'presets') renderPresetList();
    }

    // ---------------- Settings Modal ----------------

    // 暴露公共 API（供 HTML 内联事件调用）
    return {
        applyPreset,
        toggleSettings,
        updateBlockConfig,
        removeBlock,
        exportProject,
        importProject,
        undo,
        redo,
        canUndo: () => undoStack.length > 0,
        canRedo: () => redoStack.length > 0,
        loadTheme,
        setTheme,
        // Settings API
        openSettings,
        closeSettings,
        saveSettings,
        loadSettings,
        addCustomPreset,
        deleteCustomPreset,
        updateCustomPreset,
        switchTab
    };
})();
