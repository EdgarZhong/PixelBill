# P0/P1 缺陷修复审查报告（feat/p0p1-defect-fixes）

## 0. 审查边界

- 工作目录：`d:\Code\VibeCodingWork\pixel_bill\.worktrees\p0p1_fix`
- 分支：`feat/p0p1-defect-fixes`
- 未执行：控制台交互测试、UI 端到端测试（环境限制）

---

## 1. 修复项映射表（QAF -> 文件/函数/证据）

| 缺陷ID | 结论 | 关键实现 | 证据链接 |
|---|---|---|---|
| QAF-002 AI记忆手动编辑能力 | 已覆盖 | `AIMemoryPanel` 新增编辑态、增删改与保存入口；保存落盘并创建用户编辑快照 | [SettingsPage.tsx:L1239-L1273](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1239-L1273), [SettingsPage.tsx:L1377-L1439](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1377-L1439), [MemoryManager.ts:L80-L96](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/services/MemoryManager.ts#L80-L96) |
| QAF-003 Self Description入口分区 | 已覆盖 | `user-context` 入口迁入 `GLOBAL_SETTINGS`，从 `LEDGER_SETTINGS` 移除 | [SettingsPage.tsx:L106-L143](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L106-L143), [SettingsPage.tsx:L146-L184](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L146-L184) |
| QAF-004 长度限制（500） | 已覆盖 | `MAX_SELF_DESCRIPTION_LENGTH=500`，输入 `maxLength`，保存前阻断超限 | [SettingsPage.tsx:L878-L936](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L878-L936), [SettingsPage.tsx:L991-L1006](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L991-L1006) |
| QAF-005 快照当前状态一致性 | 已覆盖 | 学习后创建当前快照；无匹配时自动创建基线快照；当前快照不可删除（UI+服务层） | [LearningSession.ts:L225-L244](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/ai_engine/LearningSession.ts#L225-L244), [SettingsPage.tsx:L1098-L1126](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1098-L1126), [SettingsPage.tsx:L1205-L1228](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1205-L1228), [SnapshotManager.ts:L355-L371](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/services/SnapshotManager.ts#L355-L371) |
| QAF-006 快照内容预览能力 | 已覆盖 | 快照列表新增 `VIEW`；通过 `SnapshotManager.read` 加载并展示详情 | [SettingsPage.tsx:L1230-L1237](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1230-L1237), [SettingsPage.tsx:L1487-L1555](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1487-L1555), [SnapshotManager.ts:L208-L250](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/services/SnapshotManager.ts#L208-L250) |
| QAF-007 命名迁移（移除 AI_USER_CONTEXT） | 已覆盖 | 菜单与标题统一为 `SELF_DESCRIPTION`；源码扫描无 `AI_USER_CONTEXT` 命中 | [SettingsPage.tsx:L125-L130](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L125-L130), [SettingsPage.tsx:L241-L242](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L241-L242), [SettingsPage.tsx:L981-L985](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L981-L985) |

---

## 2. 白盒链路审查（文字链路图）

### 2.1 设置页入口 -> 面板切换 -> 对应状态字段

- 起点函数：`SettingsPage` 初始化 `currentView` 与设置项点击处理 [SettingsPage.tsx:L94-L184](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L94-L184)
- 关键中间函数：顶部标题与 `AnimatePresence` 根据 `currentView` 切换子面板 [SettingsPage.tsx:L236-L299](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L236-L299)
- 终点副作用：渲染 `UserContextPanel` 或 `AIMemoryPanel`，进入对应数据读写链路 [SettingsPage.tsx:L283-L297](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L283-L297)
- 风险点：`PanelView` 依赖字符串常量，后续重构若改字面量可能导致面板不可达

### 2.2 记忆编辑 -> 保存函数 -> 持久化调用 -> 快照更新

- 起点函数：`AIMemoryPanel` 的 `updateMemoryLine/addMemoryLine/removeMemoryLine` [SettingsPage.tsx:L1239-L1249](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1239-L1249)
- 关键中间函数：`handleSaveMemories` 标准化内容并保存 [SettingsPage.tsx:L1251-L1273](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1251-L1273)
- 终点副作用：
  - 持久化写入：`MemoryManager.save -> Filesystem.writeFile` [MemoryManager.ts:L80-L96](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/services/MemoryManager.ts#L80-L96)
  - 快照更新：`SnapshotManager.create('user_edit', ...)` [SettingsPage.tsx:L1256-L1260](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1256-L1260), [SnapshotManager.ts:L121-L185](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/services/SnapshotManager.ts#L121-L185)
- 风险点：保存时做 `trim+filter`，会丢弃纯空行；符合当前规则但需在产品说明中明确

### 2.3 学习会话 -> 快照创建时机 -> 当前快照标识

- 起点函数：`LearningSession.run` [LearningSession.ts:L144-L173](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/ai_engine/LearningSession.ts#L144-L173)
- 关键中间函数：操作执行完成后再创建快照 [LearningSession.ts:L210-L233](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/ai_engine/LearningSession.ts#L210-L233)
- 终点副作用：
  - 返回 `snapshotId` 给 UI [LearningSession.ts:L239-L244](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/ai_engine/LearningSession.ts#L239-L244)
  - UI 设置 `currentSnapshotId` 并刷新状态 [SettingsPage.tsx:L1157-L1166](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1157-L1166)
  - 无匹配快照时自动创建“基线快照” [SettingsPage.tsx:L1109-L1118](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1109-L1118)
- 风险点：`findMatchingSnapshot` 逐条读取快照比对，快照量大时有性能开销

### 2.4 快照列表 -> 预览入口 -> 内容读取函数 -> 删除保护逻辑

- 起点函数：历史快照列表按钮渲染 [SettingsPage.tsx:L1463-L1517](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1463-L1517)
- 关键中间函数：
  - 预览：`handlePreviewSnapshot -> SnapshotManager.read` [SettingsPage.tsx:L1230-L1237](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1230-L1237), [SnapshotManager.ts:L208-L250](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/services/SnapshotManager.ts#L208-L250)
  - 删除保护：`handleDeleteSnapshot` 前置阻断 + 删除按钮禁用 [SettingsPage.tsx:L1205-L1228](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1205-L1228), [SettingsPage.tsx:L1506-L1515](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1506-L1515)
- 终点副作用：服务层二次保护，若删除目标为当前匹配快照则拒绝 [SnapshotManager.ts:L355-L361](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/services/SnapshotManager.ts#L355-L361)
- 风险点：当前激活态基于“内容匹配”计算，不是单独持久化指针；存在“内容相同快照”时的可解释性风险

### 2.5 自述输入 -> 长度限制 -> 保存逻辑

- 起点函数：`UserContextPanel` 的 textarea 输入 [SettingsPage.tsx:L991-L1001](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L991-L1001)
- 关键中间函数：`maxLength={500}` + `handleSave` 超限阻断 [SettingsPage.tsx:L911-L936](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L911-L936), [SettingsPage.tsx:L995-L1006](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L995-L1006)
- 终点副作用：`ConfigManager.saveUserContext(userContext.trim())` 写入自述文件 [SettingsPage.tsx:L921-L923](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L921-L923)
- 风险点：当前按字符数限制，不区分中英文宽度与 token 代价

---

## 3. 静态检查结果（必跑）

### 3.1 npm run lint

```bash
> pixel_bill@0.0.0 lint
> eslint .
```

结论：PASS（exit code 0）

### 3.2 npm run build

```bash
> pixel_bill@0.0.0 build
> tsc -b && vite build
...
✓ built in 3.70s
```

结论：PASS（exit code 0）  
备注：存在 Vite chunk size warning 与动态导入提示，非本次阻断缺陷

---

## 4. 差异审查结果（必做）

### 4.1 git status --short

```bash
 M src/components/mobile/SettingsPage.tsx
 M src/core/ai_engine/LearningSession.ts
 M src/core/services/SnapshotManager.ts
```

### 4.2 git --no-pager diff --stat

```bash
 src/components/mobile/SettingsPage.tsx | 276 +++++++++++++++++++++++++--------
 src/core/ai_engine/LearningSession.ts  |  27 ++--
 src/core/services/SnapshotManager.ts   |  12 +-
 3 files changed, 232 insertions(+), 83 deletions(-)
```

### 4.3 git --no-pager diff -- <关键文件列表>

- 已输出并审查以下关键变更：
  - `src/components/mobile/SettingsPage.tsx`：入口分区、命名迁移、500限制、记忆可编辑、快照预览、删除保护、Select语义
  - `src/core/ai_engine/LearningSession.ts`：学习后创建当前快照
  - `src/core/services/SnapshotManager.ts`：允许空内容快照创建、服务层当前快照删除保护

---

## 5. 未验证项声明

- 因环境限制，未执行控制台交互测试。
- 因环境限制，未执行 UI 端到端测试。
- 本报告采用“最大化代码关系审查 + 可执行静态验证 + 可审计证据输出”替代。
