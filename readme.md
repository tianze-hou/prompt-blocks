# PromptBlocks 🧱

> A minimalist prompt assembler. 
> 极简、纯粹的本地 Prompt 拼接构建工具。

PromptBlocks 是一个面向开发者和 AI 重度用户的轻量级工具。它可以帮助你像搭积木一样，将各种文件源码、指令片段、上下文背景拼接成一段结构良好、Token 精确的超级 Prompt，直接喂给大模型（LLMs）。

## ✨ 核心特性

- **🚀 纯静态运行**：HTML + CSS + Vanilla JS 编写。无需 Node.js，无需打包，直接用浏览器打开 `index.html` 即可使用。
- **🧱 积木化组合**：支持文本输入（Instruction）与本地文件导入（File），自动提取文件名并组合。
- **🎯 丝滑拖拽**：带有顺滑占位动画的拖拽排序，快速调整 Prompt 的上下文权重与顺序。
- **📥 拖放上传**：直接将多个本地文件拖入左侧区域即可读取内容。
- **📏 精准 Token 估算**：内置 `js-tiktoken` (cl100k_base 编码)，本地精准计算 OpenAI 系模型的 Token 消耗，告别超长截断。
- **💾 自动保存**：基于 LocalStorage 本地持久化，刷新网页数据不丢失。
- **🛠 极客范定制**：支持全局起止符设置，支持为每一个特定的代码块独立自定义包裹模板（Template）。

## 📂 项目结构

```text
PromptBlocks/
├── index.html       # 核心视图
├── css/
│   └── styles.css   # 暗黑极客风样式 & 动画
└── js/
    └── app.js       # 核心业务逻辑 (拖拽、组装、Token 计算)