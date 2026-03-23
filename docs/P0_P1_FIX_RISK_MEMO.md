# P0/P1 修复风险备忘录（feat/p0p1-defect-fixes）

## 1. 本次改动风险点

### 1.1 快照“当前态”判定依赖内容匹配

- 现状：当前快照通过 `findMatchingSnapshot` 做内容比对推断 [SnapshotManager.ts:L303-L325](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/services/SnapshotManager.ts#L303-L325)
- 风险：若存在多个内容相同快照，当前态解释可能与用户心理模型不完全一致
- 建议：后续可评估显式“currentSnapshotId”持久化指针策略（不在本轮范围）

### 1.2 快照匹配/删除保护路径的性能开销

- 现状：删除保护先计算当前匹配快照，再决定是否可删 [SnapshotManager.ts:L355-L361](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/core/services/SnapshotManager.ts#L355-L361)
- 风险：快照规模增大时，读取+比较频次提升
- 建议：后续可增加缓存或索引摘要（不在本轮范围）

### 1.3 记忆手动编辑保存的归一化策略

- 现状：保存前 `trim + filter` 过滤空文本 [SettingsPage.tsx:L1251-L1255](file:///d:/Code/VibeCodingWork/pixel_bill/.worktrees/p0p1_fix/src/components/mobile/SettingsPage.tsx#L1251-L1255)
- 风险：用户若期望保留空行分组，会被压缩
- 建议：在 UI 提示“保存将自动清理空行”

### 1.4 构建告警非阻断但需跟踪

- 现状：`npm run build` 存在 chunk size warning
- 风险：产物体积继续增长可能影响首屏性能
- 建议：与本次缺陷无关，作为性能债务在后续迭代跟踪

---

## 2. 建议补测清单（人工测试）

### 2.1 QAF-002 记忆编辑

- 在 `AI_MEMORY` 执行：新增2条、编辑1条、删除1条、保存后重开页面复核编号连续性

### 2.2 QAF-003 分区与QAF-007命名

- 设置主面板确认 `SELF_DESCRIPTION` 仅存在于 `GLOBAL_SETTINGS`，`LEDGER_SETTINGS` 不再出现旧入口

### 2.3 QAF-004 长度限制

- 输入 500 字可保存；尝试粘贴 501+ 字，确认输入/保存均受限且状态提示一致

### 2.4 QAF-005 当前快照一致性

- 冷启动空记忆进入 `AI_MEMORY`，确认自动生成基线快照并高亮当前
- 学习后检查 `currentSnapshotId` 指向学习后快照
- 当前快照删除按钮应禁用；直接触发删除请求应被服务层拒绝

### 2.5 QAF-006 快照预览

- 历史列表点击 `VIEW` 能看到条目级内容；`SELECT` 后记忆内容应与预览一致

---

## 3. 合并前阻断项

- 阻断项结论：**无阻断项**
- 说明：
  - `lint/build` 均通过
  - 关键缺陷均有代码证据闭环
  - 未执行 UI/E2E 与控制台交互测试，属于环境限制下的已声明非阻断缺口，建议合并后尽快补测
