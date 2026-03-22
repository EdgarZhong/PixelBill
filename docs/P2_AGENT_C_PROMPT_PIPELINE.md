# Agent C 分发单：Prompt / Data Pipeline

## 1. 任务目标

确保队列任务驱动下的数据装载与 Prompt 组装稳定，符合 v5 结构。

## 2. 背景上下文

- 消费输入来自当前账本队列任务：`{ date, type }`
- 账本上下文来自当前选中账本
- 需要保障分类链路稳定，不引入触发器策略耦合

## 3. 负责范围（只做这些）

1. 按当前账本 + 任务日期加载“该天全部交易”
2. 并行装载该账本相关数据源（记忆、实例、标签定义）与全局自述
3. 组装并校验 v5 User Message 结构（`category_list` / `reference_corrections` / `days`）
4. 结果回写链路保持既有规则（含 Arbiter 锁定保护）

## 4. 禁止越界（不要做）

- 不改队列入队去重升级策略
- 不改消费范围策略（当前账本限定由 Agent B 负责）
- 不实现触发场景判定逻辑
- 不改 UI 入口与交互

## 5. 建议涉及文件

- `src/core/llm_service/prompt/PromptBuilder.ts`
- `src/core/llm_service/SystemPrompt.ts`（仅必要增量）
- `src/core/ai_engine/*`（仅消费到组装的衔接层）

## 6. 验收标准

1. 同一任务可稳定生成符合 v5 的请求体
2. `reference_corrections` 为完整条目并排序稳定
3. 日维度批次数据正确进入 `days`
4. 回写结果不破坏现有锁定保护语义

## 7. 交付物

- 组装链路代码变更
- 请求体示例（至少 normal/reclassify 各一例）
- 与 Agent A/B 的接口对齐说明
