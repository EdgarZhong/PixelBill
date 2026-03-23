# PixelBill P2 阶段缺陷报告

**日期**: 2026-03-23  
**测试角色**: 测试工程师  
**范围**: P2（分类队列、队列消费、生命周期联动、触发层）  
**依据**: 白盒审查 + 静态检查结果 + 规格对照

---

## 1. 总体结论

- 静态质量：通过（`lint/build` PASS）
- P2 主链路：已具备队列与当前账本消费能力
- 当前阻断项：2 项（均为“规格实现缺口”，非编译错误）

---

## 2. 缺陷明细

### P2-QAF-001 账本生命周期联动不完整（仅处理队列文件）

- **严重级**: High  
- **状态**: ⏳ 待修复  
- **类型**: 规格缺口（实现不完整）

- **现状**
  - 删除/重命名账本时，当前代码只处理了 `classify_queue` 的联动。
  - 未见对 `classify_memory/{ledger}.md`、`classify_examples/{ledger}.json`、`memory_snapshots/{ledger}/` 的同步处理。

- **代码证据**
  - 删除账本仅联动队列：  
    [LedgerManager.ts:L464-L467](file:///d:/Code/VibeCodingWork/pixel_bill/src/core/services/LedgerManager.ts#L464-L467)
  - 重命名账本仅联动队列：  
    [LedgerManager.ts:L549-L551](file:///d:/Code/VibeCodingWork/pixel_bill/src/core/services/LedgerManager.ts#L549-L551)

- **规格证据**
  - 删除账本应同步删除 `classify_memory/classify_examples/memory_snapshots/classify_queue`：  
    [AI_SELF_LEARNING_DESIGN_v5.md:L1113-L1122](file:///d:/Code/VibeCodingWork/pixel_bill/AI_SELF_LEARNING_DESIGN_v5.md#L1113-L1122)
  - 重命名账本应同步迁移上述四类数据：  
    [AI_SELF_LEARNING_DESIGN_v5.md:L1125-L1134](file:///d:/Code/VibeCodingWork/pixel_bill/AI_SELF_LEARNING_DESIGN_v5.md#L1125-L1134)

- **影响**
  - 账本删除/重命名后可能留下孤儿学习数据，后续学习/回退链路出现“旧账本残留”风险。

- **建议修复**
  - 在 `LedgerManager.deleteLedger/renameLedger` 增加三类资源联动处理：
    - `classify_memory/{ledger}.md`
    - `classify_examples/{ledger}.json`
    - `memory_snapshots/{ledger}/`
  - 保持“如存在才处理”的幂等策略。

---

### P2-QAF-002 ClassifyTrigger 触发层缺失（文档定义未落地）

- **严重级**: Medium  
- **状态**: ⏳ 待修复  
- **类型**: 规格缺口（模块缺失）

- **现状**
  - 规格中将 `ClassifyTrigger` 作为 P2 关键模块，但当前代码库未发现对应文件。

- **规格证据**
  - P2 目标包含 `ClassifyQueue + ClassifyTrigger`：  
    [AI_SELF_LEARNING_DESIGN_v5.md:L1066-L1071](file:///d:/Code/VibeCodingWork/pixel_bill/AI_SELF_LEARNING_DESIGN_v5.md#L1066-L1071)
  - 模块状态表中明确列出 `ClassifyTrigger`：  
    [AI_SELF_LEARNING_DESIGN_v5.md:L1155-L1168](file:///d:/Code/VibeCodingWork/pixel_bill/AI_SELF_LEARNING_DESIGN_v5.md#L1155-L1168)

- **代码核查结果**
  - `src` 下未发现 `ClassifyTrigger` 相关文件（文件级核查）。

- **影响**
  - 场景触发逻辑（日期筛选、预清理、入队编排）无法与 AI Engine 完整解耦。
  - 测试只能覆盖“队列层与消费层”，难以验证“触发层策略正确性”。

- **建议修复**
  - 新增 `ClassifyTrigger` 模块并暴露可测试接口（普通分类/重分类触发路径）。
  - 为触发层增加调试命令与自动化脚本，纳入 P2 回归集。

---

## 3. 非缺陷观察（记录）

- `build` 阶段出现 `ExampleStore` 动静态混合导入提示与 chunk size 警告，当前不阻断功能验收。

---

## 4. 修复优先级建议

1. **P0 优先**
   - P2-QAF-001 生命周期联动补全（防数据残留与语义错乱）
2. **P1 优先**
   - P2-QAF-002 触发层落地（完善 P2 架构闭环）

