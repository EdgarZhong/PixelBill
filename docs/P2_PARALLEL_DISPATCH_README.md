# P2 并行分发总览（队列基础设施阶段）

## 1. 目标与阶段边界

本轮并行开发只做 **队列基础设施**，不接管自动触发策略：

- 队列采用 **按账本隔离**：`classify_queue/{ledger}.json`
- AI Engine **仅消费当前选中账本队列**
- 分类入口仍由现有 UI 按钮控制
- CSV 导入/标签变更等自动触发，暂不接管线上逻辑

## 2. Workstream 列表

- Agent A：`docs/P2_AGENT_A_QUEUE_CORE.md`
- Agent B：`docs/P2_AGENT_B_ENGINE_SCOPE.md`
- Agent C：`docs/P2_AGENT_C_PROMPT_PIPELINE.md`
- Agent D：`docs/P2_AGENT_D_LIFECYCLE_DEBUG.md`

## 3. 全局一致性规则

所有 Agent 必须遵守：

1. 不修改触发策略判定逻辑，不新增自动触发入口。
2. 不改动现有前端交互流程（按钮入口保留）。
3. 不跨 Workstream 改写他人负责模块，避免并行冲突。
4. 不改变仲裁优先级链（USER > RULE_ENGINE > AI_AGENT）。
5. 所有文件系统操作必须使用 Capacitor Filesystem API。

## 4. 集成顺序

按以下顺序集成，降低冲突：

1. 先合并 Agent A（队列内核）
2. Agent B 与 Agent C 并行合并
3. 再合并 Agent D（生命周期与调试补齐）
4. 最后统一执行按钮触发链路 E2E 验收

## 5. 统一验收口径

- 仅当前选中账本队列会被消费
- 非当前账本队列任务停放且不丢失
- 同账本同日期任务单槽位去重，低优先级跳过，高优先级升级
- App 重启后，当前账本队列仍可继续消费
- 删除/重命名账本后，队列文件随账本生命周期同步
