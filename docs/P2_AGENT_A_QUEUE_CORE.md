# Agent A 分发单：Per-Ledger Queue Core

## 1. 任务目标

实现按账本隔离的队列内核，确保分类任务在每个账本内独立管理。

## 2. 背景上下文

- 当前架构已决定：队列从全局单文件改为 `classify_queue/{ledger}.json`
- 当前阶段不改触发策略，只建设基础设施
- 冲突规则：同账本同日期仅保留一个任务槽位

## 3. 负责范围（只做这些）

1. 定义队列任务模型（账本内）：`{ date, type, created_at, updated_at }`
2. 实现每账本队列读写与持久化
3. 实现同日期去重与优先级升级规则  
   `reclassify_full > reclassify_affected / reclassify_scoped > normal`
4. 实现基础操作：enqueue / dequeue / peek / list / clear

## 4. 禁止越界（不要做）

- 不实现自动触发场景判定
- 不改 UI 按钮或页面交互
- 不改 AI Engine 消费调度策略
- 不改 Prompt 组装逻辑

## 5. 建议涉及文件

- `src/core/ai_engine/ClassifyQueue.ts`
- `src/core/services/*`（如需新增队列存储封装）
- `src/types/*`（如需新增队列类型）

## 6. 验收标准

1. 不同账本写入不同队列文件，互不污染
2. 同账本同日期重复入队不会产生重复任务
3. 低优先级不会覆盖高优先级，高优先级可升级既有任务
4. App 重启后可恢复队列内容

## 7. 交付物

- 代码变更
- 最小测试说明（包含至少 3 组冲突规则样例）
- 风险说明（并发写入、异常恢复）
