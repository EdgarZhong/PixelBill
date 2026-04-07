# Moni（PixelBill）账单管理系统

![PixelBill](./public/icon.svg)

**Moni**（原 PixelBill）是一个个人记账应用，采用 **Memphis 风格**设计语言，将抽象的财务数据转化为温暖、直观、有节奏感的视觉体验。

> 当代生成式点阵 × 孟菲斯温暖色系 × AI 越用越懂你

最高设计哲学定义见 [SOUL.md](./SOUL.md) ｜ 视觉设计规范见 [DESIGN.md](./docs/DESIGN.md)

---

## ✨ 核心特性

- **本地优先 (Local-First)**：数据完全存储在本地 JSON 文件，无服务器交互，隐私绝对安全。
- **智能导入**：自动识别并解析微信支付和支付宝的 CSV 账单文件。
- **AI 自学习**：
  - **P0 实例库**：自动采集用户修正记录，注入 Prompt，越用越准。
  - **P1 记忆文件 v6**：AI 记忆文件 + 版本快照系统（单一事实源架构）。
  - **P2 分类队列**：分类任务队列 + 渐进式标签变更 UI，触发精准。
- **多账本管理**：创建、切换、删除账本，账本间数据完全隔离。
- **Memphis 风格首页（Moni UI）**：
  - 看板：月度预算进度卡 + 30 天折线趋势图（上下滑切换）
  - 分类标签轨道（横向 sticky 筛选）
  - 按天分组流水卡（三阶段展开）
  - 长按拖拽分类 + 理由输入弹窗
  - AI 控制条（长按中央按钮唤出）

---

## 🛠️ 技术栈

- **Frontend**: React 19, TypeScript, Vite
- **Mobile Framework**: Capacitor（Android 适配层，通过适配器模式隔离）
- **Styling**: Memphis 内联 style（主页）+ TailwindCSS（设置页）
- **Animation**: Framer Motion（设置页/旧 UI 过渡动画）
- **Data Processing**: PapaParse（CSV 解析）, date-fns（日期处理）

---

## 🏗️ 架构概览

### Core-UI 分离 + 适配器模式

```
src/
├── core/               # 平台无关业务逻辑
│   ├── adapters/       # 文件系统 / 触觉反馈适配器接口 + Capacitor 实现
│   ├── arbiter/        # 分类仲裁系统（USER > RULE_ENGINE > AI_AGENT）
│   ├── ai_engine/      # AI 分类引擎（BatchProcessor / ClassifyQueue）
│   ├── llm_service/    # LLM 服务 + PromptBuilder
│   ├── plugin/         # 分类插件（UserMeta / AIEngine / RegexRule）
│   └── services/       # 核心服务（LedgerService / LedgerManager / BudgetManager / ...）
├── features/
│   └── moni-home/      # Moni 首页 UI 组件库（Memphis 风格 TSX）
├── pages/
│   └── MoniHome.tsx    # Moni 首页主容器（接入全部真实业务数据）
├── hooks/
│   └── useMoniHomeData.ts  # 首页聚合读模型 Hook
├── platform/
│   └── haptics.ts      # 触觉反馈（HapticsService 适配器封装）
├── views/
│   └── DesktopApp.tsx  # 桌面端视图（保留旧 Cyber-Zen 风格）
├── components/
│   ├── mobile/         # 旧移动端组件（SettingsPage 等保留）
│   └── moni/           # Moni 新组件（OnboardingBanner 等）
└── App.tsx             # 入口路由（移动端 → MoniHome，桌面端 → DesktopApp）
```

### 仲裁优先级链

```
用户手动分类 (USER)  >  规则引擎 (RULE_ENGINE)  >  AI Agent (AI_AGENT)
```

### 数据流

```
CSV 导入 → Parser → LedgerService → Arbiter → Plugins → 最终分类
                                     ↓
                             PersistenceManager
                                     ↓
                          *.pixelbill.json (JSON 存储)
```

### 适配器层

业务代码层零 `@capacitor/filesystem` / `@capacitor/haptics` 直接依赖，全部通过 `FilesystemService` / `HapticsService` 工厂服务统一调用。

```
业务代码
  └─ FilesystemService.getInstance()
        ├─ CapacitorFilesystemAdapter  （移动端 / dev mock）
        ├─ IndexedDBFilesystemAdapter  （纯 Web，待实现）
        └─ ElectronFilesystemAdapter   （桌面端，规划中）
```

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- 现代浏览器（Chrome / Edge）

### 安装与运行

```bash
# 克隆仓库
git clone git@github.com:EdgarZhong/PixelBill.git
cd PixelBill

# 安装依赖
npm install

# 启动开发服务器（Mock 文件系统，无需真机）
npm run dev
# 访问 http://localhost:5173/
```

### Android 真机调试

```bash
npm run build
npx cap sync
npx cap run android
```

### Mock 文件系统

开发模式下，`@capacitor/filesystem` 被 Vite Alias 劫持到 `src/mocks/`，文件操作重定向到：

| Directory | 本地路径 |
|-----------|----------|
| `Directory.Documents` | `virtual_android_filesys/Documents_path/` |
| `Directory.Data` | `virtual_android_filesys/sandbox_path/` |

业务代码无感知，始终认为自己运行在 Android 环境。

---

## 📅 开发进展

| 阶段 | 状态 | 说明 |
|------|------|------|
| P0: AI 自学习 · 实例库 | ✅ | 自动采集用户修正 + Prompt 注入 |
| P1: AI 自学习 · 记忆文件 v6 | ✅ | 单一事实源快照 + 版本管理 |
| P2: AI 自学习 · 分类队列 | ✅ | 渐进式标签 UI + 队列触发消费 |
| P3: AI 自学习 · 列表快速修正 | 🚧 | 规划中 |
| 前端剥离 Phase 1-5 | ✅ | 全链路 Capacitor 解耦 |
| 前端剥离 Phase 6 | 🚧 | IndexedDB 适配器 + 测试（待开始） |
| **Moni UI 整合 T1-T11** | ✅ | **Memphis UI 全量接入，编译零错误** |
| Moni 后续联调 | 🚧 | 设置/记账/账本切换入口待接入 |

---

## 🎨 设计语言

### Moni（Memphis 风格）

- 背景：`#F5F0EB`（暖米色）
- 品牌色：coral `#FF6B6B` / blue `#7EC8E3` / yellow `#F9D56E` / mint `#4ECDC4`
- 字体：Nunito（圆润粗体）+ Space Mono（数字等宽）
- 装饰：随机圆形/方形/三角形散点，低透明度，Memphis 几何美学

### 桌面端（Cyber-Zen 风格，保留）

- 赛博禅意，深空背景 + 呼吸光效
- 字体：`Press Start 2P` + `Space Mono`

---

## 🧪 调试工具

开发模式下在浏览器控制台访问 `window.__DEBUG_TOOLS__`：

```javascript
// 查看账本数据
window.__DEBUG_TOOLS__.checkAIData('default')

// 实例库
await window.__DEBUG_TOOLS__.listExamples()

// 记忆文件 + 快照
await window.__DEBUG_TOOLS__.loadMemories()
await window.__DEBUG_TOOLS__.listSnapshots()

// 分类队列
await window.__DEBUG_TOOLS__.viewQueue()
await window.__DEBUG_TOOLS__.runP2FullChainRegression()
```

---

## 📁 关键文档

| 文档 | 路径 |
|------|------|
| 视觉设计规范 | `docs/DESIGN.md` |
| AI 自学习设计 v6 | `AI_SELF_LEARNING_DESIGN_v6.md` |
| v6 快照迁移指南 | `docs/V6_MIGRATION_GUIDE.md` |
| 前端剥离方案 | `docs/FRONTEND_SEPARATION_PLAN.md` |
| 项目协作规范 | `CLAUDE.md` |

---

Made with ❤️ by **CyberZen Studio**  
License: MIT
