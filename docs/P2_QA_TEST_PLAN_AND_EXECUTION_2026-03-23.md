# PixelBill P2 阶段测试文档（计划 + 执行记录）

**日期**: 2026-03-23  
**测试角色**: 测试工程师  
**范围**: P2（分类队列、当前账本消费、Prompt v5、生命周期联动、调试能力）  
**测试层次**: 白盒审查 + 控制台脚本测试 + UI 端到端评估

---

## 1. 总体测试策略（三层）

### 第一层：白盒测试（代码静态检查 + 逻辑评审）

- 目标：确认实现与设计一致，不依赖人工点击即可发现结构性偏差。
- 执行项：
  - 静态检查：`npm run lint`
  - 构建检查：`npm run build`
  - 设计一致性审查：对照 `AI_SELF_LEARNING_DESIGN_v5.md` 核查关键链路

### 第二层：控制台脚本测试（高自由度组合）

- 目标：使用 `window.__DEBUG_TOOLS__` 快速回归与自由编排场景，覆盖队列/生命周期/标签链路。
- 执行方式：浏览器 DevTools Console 直接执行成套命令。

### 第三层：UI 端到端测试（是否需要）

- 结论：**P2 验收需要最小 E2E**。
- 原因：P2 约束是“入口仍由 UI 按钮触发”，仅测队列打印无法证明“按钮 -> 入队 -> 消费 -> 状态反馈”闭环。

---

## 2. 第一层执行记录（白盒）

## 2.1 执行步骤

```bash
npm run lint
npm run build
```

## 2.2 预期输出

- lint 无 error
- build 成功产物输出
- 允许存在非阻断 warning（如 chunk size 提示）

## 2.3 实际结果

- `lint`: 通过（PASS）
- `build`: 通过（PASS）
- 备注：存在 `ExampleStore` 动静态混合导入 warning 与 chunk size warning，当前不阻断 P2 验收

---

## 3. 第二层执行用例（控制台成套指令）

说明：以下命令按“基础 -> 回归 -> 生命周期 -> 标签链路”顺序组织，可整套执行，也可按需抽取。  
新增高自由度命令定义见 [App.tsx:L587-L716](file:///d:/Code/VibeCodingWork/pixel_bill/src/App.tsx#L587-L716)。

### 3.1 基础观测与清场

```javascript
await window.__DEBUG_TOOLS__.checkAIConfig()
await window.__DEBUG_TOOLS__.viewQueue('*')
await window.__DEBUG_TOOLS__.queueSnapshot('*')
await window.__DEBUG_TOOLS__.clearQueue()
```

**预期输出**
- 队列为空或返回明确统计对象
- 清场后 `viewQueue('*')` 长度为 0

### 3.2 队列原语与批量注入（高自由度）

```javascript
await window.__DEBUG_TOOLS__.addTestTasksBatch([
  { ledger: 'default', date: '2026-03-18', type: 'normal' },
  { ledger: 'default', date: '2026-03-18', type: 'reclassify_full' },
  { ledger: 'ledger_b', date: '2026-03-19', type: 'reclassify_affected' }
])

await window.__DEBUG_TOOLS__.viewQueue('*')
await window.__DEBUG_TOOLS__.queueSnapshot('*')
await window.__DEBUG_TOOLS__.peekTask('default')
await window.__DEBUG_TOOLS__.dequeueTask('default')
await window.__DEBUG_TOOLS__.viewQueue('default')
await window.__DEBUG_TOOLS__.removeTask('ledger_b', '2026-03-19')
```

**预期输出**
- 同日任务优先级升级生效（`normal` 被 `reclassify_full` 覆盖）
- `peekTask` 不改变队列长度
- `dequeueTask` 使目标账本队列长度减 1
- `removeTask` 返回 `true` 且目标任务消失

### 3.3 一键 P2 回归

```javascript
await window.__DEBUG_TOOLS__.runP2Test()
```

**预期输出**
- 返回结构化结果对象（含 `queueA/queueB/total/snapshot`）
- 覆盖项：账本隔离、优先级升级、队列快照统计、任务清理

### 3.4 生命周期联动（账本创建/重命名/删除）

```javascript
await window.__DEBUG_TOOLS__.testLedgerLifecycleQueue()
```

**预期输出**
- 返回对象：`created/renamed/deleted` 为 `true`
- 队列数量变化符合迁移与删除语义：
  - `beforeRename > 0`
  - `afterRenameOld == 0`
  - `afterRenameNew > 0`
  - `afterDelete == 0`

### 3.5 标签链路

```javascript
await window.__DEBUG_TOOLS__.listCategories()
await window.__DEBUG_TOOLS__.addCategory('qa_temp_tag', 'QA临时标签')
await window.__DEBUG_TOOLS__.renameCategory('qa_temp_tag', 'qa_temp_tag_renamed')
await window.__DEBUG_TOOLS__.updateCategoryDesc('qa_temp_tag_renamed', 'QA临时标签-已更新')
await window.__DEBUG_TOOLS__.deleteCategory('qa_temp_tag_renamed')
```

**预期输出**
- 增删改接口返回成功
- 删除返回 `affectedTxIds` 列表，不出现异常抛错

### 3.6 真实消费闭环（必须）

```javascript
// 1) 准备任务
await window.__DEBUG_TOOLS__.addTestTask('default', '2026-03-18', 'normal')

// 2) 通过现有 UI 按钮触发 AI 分类（按当前产品入口）
// 3) 触发后观察：
await window.__DEBUG_TOOLS__.viewQueue('default')
```

**预期输出**
- 触发前队列有任务，触发成功后目标日期任务被消费并移除
- 失败场景下任务保留（可重试）

---

## 4. 第三层 E2E 测试建议（P2 验收必要）

最小 E2E 场景建议：

1. **账本 A/B 隔离**
   - A 入队并触发消费，确认只消费 A
   - 切换到 B 后触发，确认不混入 A 数据

2. **Prompt v5 结构抽样**
   - 抽查请求体含 `category_list/reference_corrections/days`
   - `days[0].date` 与任务日期一致

3. **失败不丢任务**
   - 人为制造请求失败后，确认队列任务仍在（策略 A）

---

## 5. 结果汇总（本轮）

- 第一层（白盒）：已执行，PASS
- 第二层（控制台）：已给出成套命令，待测试工程师按环境执行并回填
- 第三层（E2E）：建议纳入 P2 验收必跑最小集

---

## 6. 当前白盒发现的问题（已转缺陷报告）

- 生命周期联动仅覆盖 `classify_queue`，尚未覆盖 `classify_memory/classify_examples/memory_snapshots`
- `ClassifyTrigger` 触发层尚未落地（文档定义存在，代码文件缺失）

