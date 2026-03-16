# CLAUDE.md

## 项目基本信息

### 项目概述

**PixelBill** 是一个个人记账 SPA 应用，奉行"生成式极简主义"与"赛博禅意"（Cyber-Zen）的设计哲学。采用"当代生成式点阵"（Contemporary Generative Dot Matrix）风格，将抽象财务数据转化为冷静、理性、秩序感的视觉体验。

**核心功能**：
- 导入并整合微信、支付宝 CSV 账单
- AI 智能分类（优先级：用户 > 规则引擎 > AI Agent）
- 多账本管理（支持创建、切换、删除账本）
- 交易详情查看与分类编辑
- AI 分类状态实时反馈系统

**技术栈**：React + TypeScript + Vite + Capacitor + TailwindCSS + Framer Motion

### 架构设计

#### Core-UI 分离（Wrapper + Strategy 模式）

```
src/
├── core/          # 平台无关的业务逻辑
│   ├── arbiter/   # 分类仲裁系统（核心决策引擎）
│   ├── plugin/    # 分类插件（UserMeta/AIEngine/RegexRule）
│   ├── services/  # LedgerService/PersistenceManager
│   ├── ai_engine/ # AI 分类引擎
│   └── llm_service/ # LLM 服务与 Prompt 管理
├── views/         # 平台特定视图容器
│   ├── DesktopApp.tsx
│   └── MobileApp.tsx
├── components/    # UI 组件
│   ├── common/    # 通用组件
│   ├── desktop/   # 桌面端组件
│   └── mobile/    # 移动端组件
└── hooks/         # 连接 UI 与 Core 的 React Hooks
```

#### 数据流

```
CSV 导入 → Parser → LedgerService → Arbiter → Plugins → 最终分类决策
                                    ↓
                            PersistenceManager
                                    ↓
                         *.pixelbill.json (JSON 存储)
```

**P0 新增：实例库数据流**

```
用户修正分类 / 锁定确认
        ↓
    Arbiter.ingest() / toggleVerification()
        ↓
    ExampleStore.addOrUpdate() ──→ classify_examples/{ledger}.json
        ↓
    下次分类时 PromptBuilder.retrieveRelevant()
        ↓
    注入 Prompt.context.reference_corrections
        ↓
    LLM 参考历史案例进行分类
```

#### 仲裁系统优先级链

1. **USER** - 用户手动分类（最高优先级）
2. **RULE_ENGINE** - 规则引擎匹配
3. **AI_AGENT** - AI 智能分类（异步）

### 测试环境

**开发模式** (`npm run dev`)：
- Vite 配置将 Capacitor API 调用劫持到 Mock 实现
- Mock 层将文件操作重定向到 `virtual_android_filesys/` 目录
- **软件本身无法感知是否在测试环境** - 它认为自己始终运行在原生 Android 环境
- 不要试图检测或绕过 Mock 层

**Android 真机/模拟器**：
- 使用 Capacitor Filesystem API 访问实际文件系统
- 账本索引存储在 APP 沙箱目录
- 账本数据存储在 `Documents/PixelBill/` 目录

### 主要 Feature 状态

| 功能模块 | 状态 | 说明 |
|----------|------|------|
| CSV 导入解析 | ✅ 已完成 | 支持微信、支付宝账单格式 |
| AI 智能分类 | ✅ 已完成 | 基于 Arbiter 的多源决策系统 |
| AI 状态反馈 UI | ✅ 已完成 | 呼吸光效、进度指示、置信度可视化 |
| **AI 自学习 P0** | ✅ **已完成** | **实例库自动采集 + 注入 Prompt** |
| AI 自学习 P1 | 🚧 规划中 | 记忆文件 + 学习会话机制 |
| 多账本管理 | ✅ 已完成 | 创建、切换、左滑删除 |
| 账本切换器 | ✅ 已完成 | 二级面板、丝滑动画 |
| 交易详情页 | ✅ 已完成 | 分类编辑、备注修改 |
| 标签轮盘 | ✅ 已完成 | 移动端分类选择器 |
| 本地 LLM 支持 | 🚧 规划中 | 当前使用远程 LLM API |

---

## 项目目录结构

```
pixel_bill/
├── android/                    # Capacitor Android 项目
├── docs/                       # 项目文档
│   ├── DESIGN.md              # 视觉设计系统（Cyber-Zen）
│   ├── ledger-switch-feature.md # 账本切换功能规划
│   └── archived/              # 归档文档
├── public/                     # 静态资源
├── scripts/                    # 测试与工具脚本
├── src/
│   ├── assets/                # 图片、字体等资源
│   ├── components/
│   │   ├── common/            # 通用组件
│   │   ├── desktop/           # 桌面端组件
│   │   └── mobile/            # 移动端组件
│   ├── config/                # 配置文件
│   ├── core/                  # 核心业务逻辑
│   │   ├── ai_engine/         # AI 分类引擎
│   │   ├── arbiter/           # 仲裁系统
│   │   ├── config/            # 配置管理
│   │   ├── llm_service/       # LLM 服务（含 PromptBuilder、SystemPrompt）
│   │   ├── logging/           # 日志系统
│   │   ├── network/           # 网络层
│   │   ├── plugin/            # 分类插件
│   │   └── services/          # 核心服务
│   │       ├── LedgerService.ts      # 账本状态管理
│   │       ├── LedgerManager.ts      # 账本生命周期管理
│   │       ├── PersistenceManager.ts # 持久化（防抖写入）
│   │       └── ExampleStore.ts       # 【P0 新增】实例库管理
│   ├── debug/                 # 调试工具
│   ├── hooks/                 # React Hooks
│   ├── mocks/                 # 开发环境 Mock
│   ├── scripts/               # 运行时脚本
│   ├── types/                 # TypeScript 类型定义
│   ├── utils/                 # 工具函数
│   └── views/                 # 视图容器
├── virtual_android_filesys/   # 开发环境模拟文件系统
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 重要文档索引表

| 文档名称 | 内容描述 | 文件路径 |
|----------|----------|----------|
| 设计文档 | Cyber-Zen 视觉设计系统、色彩规范、动效规范 | `docs/DESIGN.md` |
| **AI 自学习设计** | **P0/P1/P2/P3 完整设计文档（含实现状态）** | `AI_SELF_LEARNING_DESIGN_v4.md` |
| **P0 测试指南** | **实例库自动采集 + 注入 测试文档** | `docs/P0_TEST_GUIDE.md` |
| 账本切换功能规划 | 账本切换功能详细设计规范（已实施完成） | `docs/ledger-switch-feature.md` |
| 开发日志 Day 2 | Android 文件系统适配详细记录 | `docs/DAY2_IMPLEMENTATION.md` |
| 开发日志 Day 3 | AI 引擎集成详细记录 | `docs/DAY3_IMPLEMENTATION.md` |
| 重构计划 | 核心架构重构规划 | `docs/REFACTOR_PLAN.md` |
| 测试报告 | 功能测试结果记录 | `docs/TEST_REPORT.md` |
| 分类体验 Demo | AI 分类体验反馈 | `docs/meal_classify_demo_experience.md` |

---

## 项目代码规范

### Capacitor 文件系统访问规范

**唯一合法的 API 调用方式**：

```typescript
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// 读取账本数据文件
const result = await Filesystem.readFile({
  path: 'PixelBill/xxx.pixelbill.json',
  directory: Directory.Documents,
  encoding: Encoding.UTF8
});

// 写入账本数据文件
await Filesystem.writeFile({
  path: 'PixelBill/xxx.pixelbill.json',
  data: jsonString,
  directory: Directory.Documents,
  encoding: Encoding.UTF8
});

// 检查文件存在性
try {
  await Filesystem.stat({
    path: 'PixelBill/xxx.pixelbill.json',
    directory: Directory.Documents
  });
  // 文件存在
} catch {
  // 文件不存在
}

// 列出目录内容
const result = await Filesystem.readdir({
  path: 'PixelBill',
  directory: Directory.Documents
});
```

**禁止的行为**：
- ❌ 使用原生 Node.js `fs` 模块
- ❌ 使用 Web File System Access API 直接访问（除非是用户主动选择目录的弹窗）
- ❌ 添加环境检测逻辑来切换 API

### 文件系统存储位置规范

| 文件类型 | 存储位置 | Directory 枚举 | 说明 |
|----------|----------|----------------|------|
| `ledgers.json` (账本索引) | APP 沙箱目录 | `Directory.Data` | 账本索引 |
| `*.pixelbill.json` (账本数据) | `Documents/PixelBill/` | `Directory.Documents` | 账本主数据文件 |
| `classify_examples/{ledger}.json` | 沙箱目录 | `Directory.Data` | **P0 新增** - 实例库（用户修正/锁定记录） |
| `classify_memory/{ledger}.md` | `Documents/PixelBill/classify_memory/` | `Directory.Documents` | **P1 预留** - AI 记忆文件 |
| `self_description/user_profile.md` | `Documents/PixelBill/self_description/` | `Directory.Documents` | **P1 预留** - 用户自述文件 |
| `memory_snapshots/{ledger}/` | 沙箱目录 | `Directory.Data` | **P1 预留** - 记忆文件版本快照 |

### 代码注释规范

- **所有代码必须包含详细中文注释**
- 复杂逻辑需要解释"为什么"而非"做什么"
- 组件 Props 需要 JSDoc 说明

---

## 开发测试闭环 SOP

### 启动开发环境

```bash
# 1. 启动 Vite 开发服务器
npm run dev

# 2. 浏览器访问 http://localhost:5173
# 3. 打开 DevTools 控制台，访问 window.__DEBUG_TOOLS__ 进行调试
```

### 常用调试命令

在浏览器控制台执行：

```javascript
// 查看当前账本数据
window.__DEBUG_TOOLS__.getLedgerData()

// 导出当前账本到控制台
window.__DEBUG_TOOLS__.exportData()

// 手动触发分类
window.__DEBUG_TOOLS__.classify()

// ===== P0: 实例库调试命令 =====
// 运行完整的 P0 测试
await window.__DEBUG_TOOLS__.runP0Test()

// 查看实例库内容
await window.__DEBUG_TOOLS__.listExamples()

// 添加测试数据
await window.__DEBUG_TOOLS__.addTestExample()

// 测试检索功能
await window.__DEBUG_TOOLS__.testRetrieval()

// 查看更多调试功能
window.__DEBUG_TOOLS__
```

### Android 真机测试流程

```bash
# 1. 构建生产版本
npm run build

# 2. 同步到 Android 项目
npx cap sync

# 3. 打开 Android Studio（可选）
npx cap open android

# 4. 直接运行到连接设备
npx cap run android
```

### 静态代码检查

```bash
# 运行 ESLint 检查
npm run lint

# 自动修复可修复的问题
npm run lint -- --fix
```

**检查时机**：
- 功能开发完成后，提交前必须运行
- CI/CD 流程中自动执行
- 修复错误后才能提交代码

### 代码提交规范

- 使用语义化提交信息：`feat:`, `fix:`, `refactor:`, `docs:`, `style:`
- **除非用户要求，否则不要自行 `git add` 和 `git commit`**
- **绝对禁止自行 `git push`**

---

## 项目当前进展和任务列表

### 已完成 ✅

| 任务 | 完成日期 | 提交 |
|------|----------|------|
| AI 自学习 P0：实例库自动采集 + 注入 | 2026-03-16 | 进行中 |
| 账本切换器动画优化与性能提升 | 2026-03-15 | 7dc3af3 |
| 标签轮盘动画逻辑优化 | 2026-03-14 | 8158268 |
| 修复账本初始化时分类状态不一致 | 2026-03-14 | 15e2b6c |
| 账本管理器重构（多账本+左滑删除） | 2026-03-13 | 827f912 |
| AI 引擎 UI 反馈系统集成 | 2026-03-10 | b30d194 |
| 交易详情页与分类选择器 | 2026-03-07 | 49077d3 |

### 进行中 / 待处理 🚧

| 任务 | 优先级 | 说明 |
|------|--------|------|
| AI 自学习 P1：记忆文件 + 学习会话 | P1 | 实现学习 Prompt 和增量更新机制 |
| AI 自学习 P2：标签管理升级 + 分类队列 | P2 | defined_categories 升级为映射 |
| AI 自学习 P3：列表页快速修正 | P3 | 降低修正摩擦力的交互优化 |

---

## 用户规则

- 永远用中文回答用户问题
- 所有代码必须包含详细中文注释
- 用户会在与你协作过程中自行改动文件，因此修改任何文件前**必须先读取该文件**，同步对文件内容的改动认知，确保不要破坏任何内容
- 除非用户要求 commit，否则不要自行 add 和 commit，绝对禁止自行 git push
- 当用户要求查看项目，总览项目，扫描项目目录时：**必须调用目录扫描工具递归的查看项目目录结构，不得遗漏任何项目子目录**
- 响应用户指令时必须先了解足够信息，**先思考自己应当查看哪些文件**，才能正确实施代码改动和命令行操作
- 若自主运行的命令和程序出现**未知原因的中途中断**，其大概率是由于此命令运行时间过长，**用户判定为存在异常，手动终止了命令运行**，需要深入排查程序逻辑是否正确，是否存在死循环、阻塞、算法效率过低等问题
- 用户要求读取/查看任何图片/文档时，**必须真正阅读图片/文档内容**，禁止仅根据文件名、目录结构等信息推测或根据经验推断其内容。必须根据图片/文档内容响应用户
- **行动偏好更改**：如果用户的指令略显模糊，**不要**基于最佳实践做出假设并直接执行，必须先给出建议，**用户确认后再执行**
- **绝对禁止先干活，后汇报**：在执行代码修改和命令运行前，必须先**先描述清楚意图**，然后再执行工具调用，便于用户监控
- **交互设计红线**：涉及前端交互逻辑变更，必须先在 DESIGN.md 完成设计并获得用户明确"确认"指令授权后方可实施代码；严禁未授权修改，且仅明确肯定回复视为确认，模糊表态（如"可以"或者提出了修改意见）无效

## Mermaid 绘图

- 文本中的特殊字符（如括号、空格、中文字符）会与 Mermaid 解析器发生冲突。必须使用双引号将包含特殊字符的文本包裹起来
