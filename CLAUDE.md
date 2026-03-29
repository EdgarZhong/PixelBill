# CLAUDE.md

## 项目基本信息

### 项目概述

**PixelBill** 是一个个人记账 SPA 应用，奉行"生成式极简主义"与"赛博禅意"（Cyber-Zen）的设计哲学。采用"当代生成式点阵"（Contemporary Generative Dot Matrix）风格，将抽象财务数据转化为冷静、理性、秩序感的视觉体验。

> **🎯 当前阶段：软件比赛冲刺期**
> - **目标赛事**：大学生软件比赛（已过海选）
> - **截止日期**：2026年4月10日
> - **核心任务**：全力打磨 **AI 自学习功能** —— 让 AI 越用越懂用户，无需反复调教
> - **UI 策略**：保持现有极客风格，细节推后，能用即可

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
| **AI 自学习 P1** | ✅ **已完成** | **记忆文件 + 学习会话 + 版本快照**（含 Bug 修复） |
| **AI 自学习 P2** | 🚧 **进行中** | **队列/触发/消费主链已收口；渐进式标签 UI 与文档对齐实现待完成** |
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
│   │   │   └── ClassifyQueue.ts      # 【P2 新增】分类任务队列
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
| **AI 自学习设计** | **P0/P1/P2/P3 完整设计文档（含实现状态）** | `AI_SELF_LEARNING_DESIGN_v5.md` |
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
| `classify_memory/{ledger}.md` | `Documents/PixelBill/classify_memory/` | `Directory.Documents` | **P1 新增** - AI 记忆文件 |
| `self_description/user_profile.md` | `Documents/PixelBill/self_description/` | `Directory.Documents` | **P1 新增** - 用户自述文件 |
| `memory_snapshots/{ledger}/` | 沙箱目录 | `Directory.Data` | **P1 新增** - 记忆文件版本快照 |
| `classify_queue/{ledger}.json` | 沙箱目录 | `Directory.Data` | **P2 新增** - 分类任务队列（按账本隔离） |

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

// ===== P1: 记忆文件 + 学习会话调试命令 =====
// 运行完整的 P1 测试
await window.__DEBUG_TOOLS__.runP1Test()

// 查看记忆文件
await window.__DEBUG_TOOLS__.loadMemories()

// 添加/修改/删除记忆
await window.__DEBUG_TOOLS__.addMemory('新记忆内容')
await window.__DEBUG_TOOLS__.modifyMemory(1, '修改后内容')
await window.__DEBUG_TOOLS__.deleteMemory(1)

// 查看/创建快照
await window.__DEBUG_TOOLS__.listSnapshots()
await window.__DEBUG_TOOLS__.createSnapshot('测试快照')
await window.__DEBUG_TOOLS__.rollbackSnapshot('snap_001')

// 删除指定快照
await window.__DEBUG_TOOLS__.deleteSnapshot('snap_001')

// 查找当前记忆匹配的快照
await window.__DEBUG_TOOLS__.findCurrentSnapshot()

// 查看/保存自述文件
await window.__DEBUG_TOOLS__.loadSelfDesc()
await window.__DEBUG_TOOLS__.saveSelfDesc('我是西工大学生...')

// ===== P1 新增调试命令 =====
// 查看 AI 数据状态（记忆、快照、实例库、自述）
await window.__DEBUG_TOOLS__.checkAIData('default')

// 清除 AI 记忆和快照（保留实例库，可重新学习）
await window.__DEBUG_TOOLS__.clearCurrentLedgerAI('default')

// ===== P2: 分类任务队列调试命令 =====
// 查看当前队列
await window.__DEBUG_TOOLS__.viewQueue()

// 添加测试任务
await window.__DEBUG_TOOLS__.addTestTask('default', '2026-03-18')

// 清空队列
await window.__DEBUG_TOOLS__.clearQueue()

// 测试同日合并逻辑（函数名为历史命名，后续将按 v5.1 语义重命名）
await window.__DEBUG_TOOLS__.testQueuePriority()

// 队列快照统计（按账本聚合）
await window.__DEBUG_TOOLS__.queueSnapshot('*')

// 批量注入测试任务（高自由度）
await window.__DEBUG_TOOLS__.addTestTasksBatch([
  { ledger: 'default', date: '2026-03-18' },
  { ledger: 'default', date: '2026-03-19' },
  { ledger: 'travel', date: '2026-03-18' }
])

// 逐步调试原语：peek / dequeue / remove
await window.__DEBUG_TOOLS__.peekTask('default')
await window.__DEBUG_TOOLS__.dequeueTask('default')
await window.__DEBUG_TOOLS__.removeTask('default', '2026-03-18')

// 一键执行 P2 回归测试
await window.__DEBUG_TOOLS__.runP2Test()

// 用户确认触发接线验证（日期入队）
await window.__DEBUG_TOOLS__.triggerConfirmedReclassify(['2026-03-18'], 'manual_confirmed')

// 查看触发补偿 recovery 文件
await window.__DEBUG_TOOLS__.viewQueueRecovery()

// 全链路可观测回归（生产→入队→消费→写回→状态反馈）
await window.__DEBUG_TOOLS__.runP2FullChainRegression()

// 边界回归：消费中同日重入
await window.__DEBUG_TOOLS__.testReentryDuringConsume()

// 边界回归：失败保留与重试
await window.__DEBUG_TOOLS__.testFailureRetention()

// 边界回归：锁定竞态保护（is_verified 二次校验）
await window.__DEBUG_TOOLS__.testVerifiedRaceGuard()

// 边界回归：前置成功+入队失败补偿恢复
await window.__DEBUG_TOOLS__.testTriggerCompensationRecovery()

// 生命周期联动测试（创建→重命名→删除，并校验队列迁移/清理）
await window.__DEBUG_TOOLS__.testLedgerLifecycleQueue()

// ===== P2: 标签管理调试命令 =====
// 查看当前标签
await window.__DEBUG_TOOLS__.listCategories()

// 添加新标签
await window.__DEBUG_TOOLS__.addCategory('coffee', '咖啡饮品支出')

// 删除标签
await window.__DEBUG_TOOLS__.deleteCategory('coffee')

// 重命名标签
await window.__DEBUG_TOOLS__.renameCategory('old_name', 'new_name')

// 更新标签描述
await window.__DEBUG_TOOLS__.updateCategoryDesc('meal', '日常正餐支出')

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

### Git 非交互输出规范（防分页卡住）

为避免 `git show/diff/log` 进入分页交互（需手动 `Enter/Q`）导致执行卡住，统一采用以下规则：

```bash
# 1) 查询类 Git 命令默认禁用分页器
git --no-pager show <commit>
git --no-pager diff
git --no-pager log -n 20

# 2) 先看摘要，再按需看正文，避免一次输出过长
git --no-pager show --name-only <commit>
git --no-pager show --stat <commit>
git --no-pager show <commit> -- path/to/file
```

执行原则：
- 先文件清单/统计，再展开具体文件补丁
- 长输出按文件拆分查看，避免单次全量输出
- 禁止依赖手动交互退出分页器作为常规流程

---

## 项目当前进展和任务列表

### 已完成 ✅

| 任务 | 完成日期 | 提交 |
|------|----------|------|
| **P2: defined_categories 升级为映射** | 2026-03-18 | 进行中 |
| **P2: ClassifyQueue 分类任务队列** | 2026-03-18 | 进行中 |
| **P2: LedgerService 标签管理 API** | 2026-03-18 | 进行中 |
| **P2: PromptBuilder 适配新结构（v5）** | 2026-03-23 | e0b2d86 |
| **P2: AI Engine 队列消费改造（当前账本范围 + 失败不丢任务）** | 2026-03-23 | 56cbfc6 / e0b2d86 |
| **P2: 账本生命周期扩展（队列文件删除/重命名联动）** | 2026-03-23 | 24e18b8 |
| **P2: 队列调试工具增强（按当前/指定账本查看）** | 2026-03-23 | 24e18b8 |
| P1 Bug 修复：快照 active 显示 + 删除逻辑 | 2026-03-17 | 待提交 |
| AI 自学习 P1：记忆文件 + 学习会话 | 2026-03-16 | 待提交 |
| AI 自学习 P0：实例库自动采集 + 注入 | 2026-03-16 | 55ce6f7 |
| 账本切换器动画优化与性能提升 | 2026-03-15 | 7dc3af3 |
| 标签轮盘动画逻辑优化 | 2026-03-14 | 8158268 |
| 修复账本初始化时分类状态不一致 | 2026-03-14 | 15e2b6c |
| 账本管理器重构（多账本+左滑删除） | 2026-03-13 | 827f912 |
| AI 引擎 UI 反馈系统集成 | 2026-03-10 | b30d194 |
| 交易详情页与分类选择器 | 2026-03-07 | 49077d3 |

### 进行中 / 待处理 🚧

| 任务 | 优先级 | 说明 |
|------|--------|------|
| AI 自学习 P2：分类触发层 (ClassifyTrigger) | P2 | 各场景触发逻辑按 v5.1 落地（CSV 自动触发，其余用户确认触发） |
| AI 自学习 P2：渐进式重分类交互 UI | P2 | 标签变更后的范围确认对话框；按钮确认即入队并自动衔接消费启动 |
| AI 自学习 P2：记忆文件/快照生命周期联动 | P2 | 账本删除/重命名时同步处理 classify_memory 与 memory_snapshots |
| AI 自学习 P2：测试与调试工具（自动化） | P2 | 增补 P2 场景脚本：账本隔离、失败重试、标签变更链路 |
| AI 自学习 P3：列表页快速修正 | P3 | 降低修正摩擦力的交互优化 |
| 文档同步：规格与任务看板对齐 | P2 | 同步 AI_SELF_LEARNING_DESIGN_v5.md 的阶段状态与完成项 |

### P2 当前真实状态（迁移前定稿认知）

- **已完成的主链能力**
  - 队列层已冻结为按账本隔离、按天合并的 `{ date }` 语义。
  - 触发层已具备 CSV 自动触发、用户确认触发、补偿恢复的基础能力。
  - 消费层已具备“仅当前账本消费、失败不丢任务、CAS 防同日重入吞任务、写回前 `is_verified` 二次校验”的核心保护。
  - 调试入口与最小回归命令已补齐，可覆盖队列、补偿、失败重试、锁定竞态等关键边界。
- **文档已冻结但代码尚未完全同步的点**
  - 设置页当前仍是**简化版标签管理 UI**，尚未落地文档定义的**渐进式范围确认对话框**。
  - 当前标签操作链路仍存在**默认范围硬编码**，尚未做到“用户点击哪个范围按钮，就执行哪个按钮背后的前置处理与 dirtyDates 计算”。
  - 当前实现仍以“入队后提示用户手动点 CPU 按钮”为主，尚未完全对齐“**范围按钮入队成功后自动通知消费端启动**”。
  - `重命名标签` 当前实现曾出现触发重分类的偏差，冻结口径仍应视为：**只批量改名，不进入渐进式重分类流程**。
  - 生命周期联动目前已覆盖 `classify_queue`，但 **`classify_memory` 与 `memory_snapshots` 在账本删除/重命名时的联动收尾仍待完成**。
- **结论**
  - P2 的**基础设施层与验收口径已定稿**；
  - P2 的**最后一段工作**不是重写队列，而是**把 UI/UX 层与触发层接线彻底对齐冻结文档**。

### P2 当前阶段边界（2026-03 冲刺期）

- **队列定位**：`ClassifyQueue` 作为分类请求接口层，按账本隔离存储，封装自动分类/重分类在数据筛选与预处理上的差异，对 AI Engine 隐藏复杂度。
- **本阶段目标**：按 `AI_SELF_LEARNING_DESIGN_v5.md` v5.1 冻结口径完成队列、触发层、消费层与回归验收。
- **队列语义冻结**：任务元素业务语义仅 `{ date }`，同日合并，不承载触发来源/任务类型。
- **消费约束**：AI Engine 仅消费当前选中账本队列，其他账本队列停放，切换账本后同步切换消费目标。
- **触发策略冻结**：仅 CSV 导入允许自动触发；标签相关与手动重分类均由用户确认后触发。
- **UI/UX 冻结**：标签变更的“范围差异”保留在渐进式 UI 中；不同按钮对应不同前置处理与 dirtyDates 计算逻辑。
- **前置处理约束**：条目级改写必须在入队前同步落盘，且与入队成对成立（失败需补偿）。
- **确认按钮语义冻结**：用户点击某个范围按钮时，必须当场完成该范围对应的入队；不得把范围语义延迟到后续按钮或后台推断。
- **消费启动衔接**：范围按钮入队成功后自动通知消费端启动；若消费端已在运行，则不重复唤起。
- **验收口径**：以队列链路端到端与边界回归为准，不再以“按钮触发链路”作为唯一阶段门槛。

### P2 迁移到 WSL 后的第一批 TODO（按优先级执行）

1. **渐进式标签 UI 落地**
   - 新增标签：先问是否重分类，再选“仅未分类 / 全量”。
   - 删除标签：先完成删除与数据改写，再选“仅受影响 / 全量”。
   - 修改标签描述：先改描述，再选“仅该标签 / 全量”。
   - 全量路径需要提供锁定交易列表与当场解锁能力。
2. **触发层与范围按钮一一对应**
   - 每个范围按钮都必须在点击当场完成：前置处理 → dirtyDates 计算 → 入队。
   - 禁止把范围语义延迟到后续按钮、后台推断或统一默认策略。
3. **消费端自动衔接**
   - 范围按钮入队成功后自动通知消费端启动。
   - 若当前已在消费，避免重复启动，只保留新任务在队列中等待。
4. **重命名标签逻辑回归冻结口径**
   - 只做字符串改名；
   - 不触发重分类；
   - 不改动锁定状态。
5. **生命周期联动补全**
   - 账本删除/重命名时同步处理 `classify_memory/{ledger}.md`。
   - 账本删除/重命名时同步处理 `memory_snapshots/{ledger}/`。
6. **文档与实现二次对齐验收**
   - 完成实现后重新跑 `runP2FullChainRegression()` 与边界回归命令。
   - 更新 `AI_SELF_LEARNING_DESIGN_v5.md` / `CLAUDE.md` 中 P2 状态为“实现已对齐冻结文档”。

### WSL 迁移交接状态（2026-03 定稿）

- **主仓策略**
  - `main` 作为稳定迁移基线，承载已收口的 P2 队列/触发/消费能力与最新文档冻结口径。
- **P3 策略**
  - `feat/p3-interaction-parallel` 不在 Windows 阶段强行并回 `main`。
  - 应先在该分支内提交并推送当前改动，迁移到 WSL 后再按主线最新口径做 branch merge / rebase。
- **迁移原则**
  - 先保证 `main` 与 `feat/p3-interaction-parallel` 都上云；
  - 再在 WSL 中 `pull` / `checkout` 两个分支继续开发；
  - 不依赖 Windows 本地 worktree 现场作为唯一事实来源。

### P2 并行任务分配（队列基础设施优先）

| 并行任务 | 负责人建议 | 目标产出 | 边界约束 |
|----------|------------|----------|----------|
| Workstream A：Per-Ledger Queue Core | Agent A | 实现 `classify_queue/{ledger}.json` 读写、同日去重合并、并发安全元数据 | 不改变 `{ date }` 业务语义，不改 UI 交互 |
| Workstream B：Engine Consumption Scope | Agent B | AI Engine 仅消费当前账本队列；切账本后切换消费目标 | 按 v5.1 触发策略接入，不扩展额外自动触发 |
| Workstream C：Prompt/Data Pipeline | Agent C | 按队列任务加载该天交易并拼接 v5 结构，结果回写链路稳定 | 不实现场景筛选，仅消费既有任务 |
| Workstream D：Lifecycle & Debug | Agent D | 删除/重命名账本时同步处理 `classify_queue/{ledger}.json`；完善队列调试命令 | 不新增前端交互流程 |

**集成顺序**：A → B/C 并行 → D 收尾 → E2E + 边界回归验收。

### P2 集成执行口径（B + C → D）

- D 集成顺序固定：先合 B，再合 C（`B_FINAL_HASH` → `577ca2a`）。
- 冲突最高风险文件：`src/core/ai_engine/BatchProcessor.ts`。
- `BatchProcessor.ts` 冲突处理必须同时保留：
  - B 的“仅当前账本消费范围”约束；
  - C 的“按任务日期装载 dayTxs + Prompt v5 组装 + is_verified 跳过 proposal”。
- 禁止回退到默认账本读取与旧 Prompt 结构（`context + transactions`）。
- 任务出队策略必须统一（不可混用）：
  - 推荐策略：处理成功后 remove，失败保留任务；
  - 若采用先 dequeue，失败必须补偿回队且保证幂等。
- 必须加入同日重入并发保护：出队前执行版本一致性校验（CAS），版本变化则不得删除当日任务。
- 必须加入锁定竞态保护：AI 写回前基于最新记录二次校验 `is_verified`，已锁定则丢弃该条 proposal。
- 必须保证前置处理与入队原子性：禁止出现“已改写条目但未入队”的静默状态。
- D 验收最小闭环必须覆盖：
  - A/B 账本切换后的消费隔离；
  - Prompt v5 三字段（`category_list/reference_corrections/days`）；
  - `reference_corrections` 排序稳定；
  - `is_verified=true` 不被 AI proposal 覆盖；
  - 失败场景下任务不丢失；
  - 同日二次触发（消费前/消费中）不吞任务；
  - 前置改写成功 + 入队失败可恢复补齐。

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
