// app.js
// 状态管理
let blocks = [];
let enc = null;
let isTokenizerReady = false;
let sortableInstance = null; // SortableJS 实例

// DOM 元素缓存
const DOM = {
    blocksContainer: document.getElementById('blocks-container'),
    outputArea: document.getElementById('output-area'),
    tokenDisplay: document.getElementById('token-display'),
    promptInput: document.getElementById('prompt-input'),
    toast: document.getElementById('toast'),
    fileInput: document.getElementById('file-input'),
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

// 初始化逻辑
document.addEventListener('DOMContentLoaded', () => {
    initTokenizer();
    loadFromLocal();
    bindEvents();
    renderBlocks();
});

function initTokenizer() {
    const checkInterval = setInterval(() => {
        if (typeof Tiktoken !== 'undefined') {
            try {
                enc = Tiktoken.getEncoding("cl100k_base");
                isTokenizerReady = true;
                generateOutput();
                clearInterval(checkInterval);
            } catch (e) {
                console.error("Tokenizer init failed:", e);
            }
        }
    }, 200);
}

function bindEvents() {
    document.getElementById('btn-add-block').addEventListener('click', addPromptBlock);
    document.getElementById('btn-import-file').addEventListener('click', () => DOM.fileInput.click());
    
    // 点击上传
    DOM.fileInput.addEventListener('change', (e) => {
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
    document.getElementById('btn-export').addEventListener('click', exportToFile);
    document.getElementById('btn-clear').addEventListener('click', clearAll);

    // 绑定配置项防抖更新
    Object.values(DOM.config).forEach(el => {
        el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', debouncedGenerate);
    });
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
    let loadedCount = 0;
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            blocks.push({ 
                id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                type: 'file', 
                name: file.name, 
                content: ev.target.result, 
                showTitle: true, 
                customTpl: '' 
            });
            loadedCount++;
            if (loadedCount === files.length) {
                renderBlocks();
                showToast(`成功导入 ${files.length} 个文件`);
            }
        };
        reader.readAsText(file);
    });
}

function renderBlocks() {
    let htmlStr = '';
    // 注意：这里的操作全部改为基于 block.id，防止拖拽后索引错位
    blocks.forEach((block) => {
        htmlStr += `
            <div class="block" data-id="${block.id}">
                <div class="block-header-ui">
                    <div class="drag-handle" title="拖拽排序">⠿</div>
                    <div class="block-info">
                        <div class="block-meta">
                            <span class="tag ${block.type === 'file' ? 'tag-file' : 'tag-prompt'}">${block.type}</span>
                            <span style="font-weight:bold; color: var(--text-primary);">${block.name}</span>
                        </div>
                    </div>
                    <button class="btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="toggleSettings('${block.id}')">⚙️ 设置</button>
                    <button style="background:none; border:none; color:var(--danger); cursor:pointer; margin-left:8px; padding: 4px;" onclick="removeBlock('${block.id}')" title="删除">✕</button>
                </div>
                <div class="block-settings" id="settings-${block.id}">
                    <div class="switch-group">
                        <label class="switch">
                            <input type="checkbox" ${block.showTitle ? 'checked' : ''} onchange="updateBlockConfig('${block.id}', 'showTitle', this.checked)">
                            <span class="slider"></span>
                        </label>
                        <span style="font-size:11px; color: var(--text-secondary);">在最终输出中包含此块的标题</span>
                    </div>
                    <input type="text" id="custom-tpl-${block.id}" value="${block.customTpl}" placeholder="覆盖默认模板，例如: // 文件名: {{name}}" oninput="updateBlockConfig('${block.id}', 'customTpl', this.value)">
                    
                    <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                        <span style="font-size: 11px; color: var(--text-secondary);">快捷预设:</span>
                        <span class="tag tag-preset" onclick="applyPreset('${block.id}', '--- INSTRUCTION ---')">Instruction</span>
                        <span class="tag tag-preset" onclick="applyPreset('${block.id}', '--- CONTEXT ---')">Context</span>
                        <span class="tag tag-preset" onclick="applyPreset('${block.id}', '--- SPECIFICATION ---')">Specification</span>
                        <span class="tag tag-preset" onclick="applyPreset('${block.id}', '--- EXAMPLES ---')">Examples</span>
                        <span class="tag tag-preset" onclick="applyPreset('${block.id}', '--- FILE: {{name}} ---')">File</span>
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
window.applyPreset = function(id, text) {
    document.getElementById(`custom-tpl-${id}`).value = text;
    updateBlockConfig(id, 'customTpl', text);
};

// ---------------- 核心与其他逻辑 ----------------

window.toggleSettings = function(id) {
    document.getElementById(`settings-${id}`).classList.toggle('active');
};

window.updateBlockConfig = function(id, k, v) {
    const block = blocks.find(b => b.id === id);
    if (block) {
        block[k] = v;
        debouncedGenerate();
    }
};

window.removeBlock = function(id) {
    blocks = blocks.filter(b => b.id !== id);
    renderBlocks();
    showToast("代码块已移除", true);
};

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

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
const debouncedGenerate = debounce(generateOutput, 300);

function calculateTokens(text) {
    if (!text) { DOM.tokenDisplay.innerText = "Tokens: 0"; return; }
    if (isTokenizerReady && enc) {
        try {
            DOM.tokenDisplay.innerText = `Tokens: ${enc.encode(text).length.toLocaleString()}`;
        } catch (e) {
            DOM.tokenDisplay.innerText = "Tokens: Error";
        }
    } else {
        DOM.tokenDisplay.innerText = `Tokens: ~${Math.ceil(text.length * 0.7).toLocaleString()} (估算)`;
    }
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

function clearAll() {
    if (blocks.length === 0) return;
    if (confirm('确定要清空所有已添加的代码块和输入吗？此操作不可恢复。')) {
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
    localStorage.setItem('promptBlocksState', JSON.stringify(state));
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