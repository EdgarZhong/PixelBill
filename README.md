# PixelBill 账单管理系统

![PixelBill](./public/icon.svg)

**PixelBill** 是一个奉行“生成式极简主义”与“赛博禅意”设计哲学的个人记账应用。它运行在本地，采用 **"当代生成式点阵" (Contemporary Generative Dot Matrix)** 风格，旨在安全、高效地整合微信和支付宝的账单流水。

> 冷静、理性、清晰、秩序感、像素美学。

## ✨ 核心特性

*   **本地优先 (Local-First)**: 基于 File System Access API 实现，数据完全存储在用户本地的 JSON 文件中，无服务器交互，隐私绝对安全。
*   **智能导入**: 自动识别并解析微信支付 (UTF-8) 和支付宝 (GBK) 的 CSV 账单文件，无需手动转码。
*   **生成式可视化**:
    *   **活跃度矩阵**: 动态展示最近 14 天的消费热力，像素高度与透明度随消费额动态生成。
    *   **心理账户点阵**: 使用非线性的 5 级像素点阵来直观呈现金额量级，而非枯燥的数字。
*   **多信源仲裁系统 (Arbiter)**: 
    *   内置强大的分类仲裁器，支持多插件协作。
    *   **UserMetaPlugin**: 最高优先级，实时响应并持久化用户的分类操作。
    *   **LocalAIMetaPlugin**: 读取本地 AI 预处理数据参与仲裁。
    *   **Fallback 机制**: 确保在所有插件失效时保留历史分类，防止数据丢失。
*   **JSON 即数据库**: 采用 `Raw Data` + `Meta Data` 分层架构，支持使用外部编辑器直接修改 JSON 文件来干预应用数据。

## 🛠️ 技术栈

*   **Frontend**: React 19, TypeScript
*   **Build Tool**: Vite
*   **Styling**: TailwindCSS, Framer Motion (动画)
*   **Data Processing**: PapaParse (CSV解析), date-fns (日期处理)

## 🚀 快速开始

### 环境要求
*   Node.js >= 18
*   现代浏览器 (支持 File System Access API，如 Chrome, Edge)

### 安装与运行

1.  **克隆仓库**
    ```bash
    git clone git@github.com:EdgarZhong/PixelBill.git
    cd PixelBill
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **启动开发服务器**
    ```bash
    npm run dev
    ```

4.  **构建生产版本**
    ```bash
    npm run build
    ```

## 🏗️ 架构概览

### 数据流与仲裁器 (The Arbiter)

PixelBill 的核心是一个基于优先级的仲裁系统，用于决定每一笔交易最终展示的分类。

1.  **Ingest**: 导入 CSV 流水，转换为标准化的 `TransactionBase` 对象。
2.  **Arbiter**: 遍历交易，并行询问所有注册插件。
3.  **Plugins**:
    *   `UserMetaPlugin`: 检查 `*.pixelbill.json` 中是否有用户手动标记的记录 (Priority: HIGH)。
    *   `LocalAIMetaPlugin`: 检查元数据中是否有 AI 预填充的建议 (Priority: MEDIUM)。
    *   `RegexRulePlugin` (Disabled): 正则规则匹配 (Priority: LOW)。
4.  **Decision**: 仲裁器根据优先级选出最佳提案 (Proposal)，生成最终视图。

### 元数据存储

系统会在导入 CSV 的同级目录下生成 `*.pixelbill.json` 文件，结构如下：

```json
{
  "version": "1.0",
  "records": {
    "SHA256_HASH_ID": {
      "id": "...",
      "user_category": "meal",
      "ai_category": "others",
      "ai_reasoning": "Detected keywords...",
      "updated_at": "2024-01-01 12:00:00"
    }
  }
}
```

您可以编写脚本批量修改此 JSON 文件的 `ai_category` 字段，App 会自动感知并应用。

## 📅 开发进展

*   **已完成**:
    *   [x] 核心 UI 框架搭建 (Header, Transaction List, Activity Matrix)。
    *   [x] CSV 解析与智能编码识别。
    *   [x] 基于 File System Access API 的文件读写。
    *   [x] 仲裁器 (Arbiter) 基础逻辑与 Fallback 策略。
    *   [x] 解决 React Render Loop 和 File Watcher IO Loop 问题。
*   **进行中**:
    *   [ ] AI 插件实装 (对接 LLM API 或完善离线清洗脚本)。
    *   [ ] UI 优化：添加元数据编辑入口与分类仲裁的可视化反馈。

## 🎨 设计细节

详细设计文档请参阅 [DESIGN.md](./DESIGN.md)。

*   **视觉风格**: 赛博禅意 (Cyber-Zen)，使用深空背景与呼吸光效。
*   **交互原则**: 非侵入式交互，拒绝弹窗，强调数据本身的韵律。
*   **字体**: 混合使用 `Press Start 2P` (标题) 与 `Space Mono` (数据)。

---

License: MIT
