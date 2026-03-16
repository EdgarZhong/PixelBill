# P0: 实例库自动采集 + 注入 - 实现总结

**实施日期**: 2026-03-16
**状态**: ✅ 已完成

---

## 实现概览

P0 是 PixelBill AI 自学习系统的第一阶段，实现了**实例库的自动采集**和**分类时的案例注入**。

核心目标：让 AI 能从用户的历史修正行为中学习，下次遇到相似交易时做出更准确的判断。

---

## 新增模块

### 1. ExampleStore (`src/core/services/ExampleStore.ts`)

实例库管理模块，负责：
- 实例库的 CRUD 操作（存储在沙箱 `classify_examples/{ledger}.json`）
- 智能检索算法（商户名、品类、金额区间、时段匹配）
- 字段重组（区分 AI 分对/分错的情况）

**关键接口**:
```typescript
// 添加/更新实例（用户修正或锁定时调用）
ExampleStore.addOrUpdate(ledgerName, record, isCorrection)

// 批量检索相关案例（分类前调用）
ExampleStore.retrieveRelevant(ledgerName, transactions)
```

**检索算法权重**:
| 匹配维度 | 权重 | 说明 |
|----------|------|------|
| 商户名匹配 | 50 | 完全匹配或包含关系 |
| 品类相似 | 20 | 关键词交集 |
| 金额区间 | 15 | ±50% 范围内 |
| 时段相近 | 15 | 同一餐点时段 |

### 2. Arbiter 扩展 (`src/core/arbiter/Arbiter.ts`)

新增实例库写入回调机制：
- `setExampleStoreCallback()` - 注册写入回调
- 用户修正分类时自动触发（判断是否为修正）
- 用户锁定确认时自动触发

**修正 vs 确认的判断**:
```typescript
const aiProposal = cache?.AI_AGENT;
const isCorrection = aiProposal !== undefined && aiProposal.category !== proposal.category;
```

### 3. PromptBuilder 扩展 (`src/core/llm_service/prompt/PromptBuilder.ts`)

分类前自动注入相关案例：
1. 对待分类交易逐条检索（每条最多 3 条案例）
2. 全局去重合并
3. 作为 `reference_corrections` 注入 Prompt

### 4. SystemPrompt 更新 (`src/core/llm_service/prompt/SystemPrompt.ts`)

新增四级优先级层次：
1. **Self-Description**（用户自述）- 最高优先级
2. **Reference Corrections**（实例库案例）- P0 新增
3. **Learned Preferences**（记忆文件）- P1 预留
4. **Your own inference**（AI 推断）

---

## 数据流

```
用户修正分类 / 锁定确认
        ↓
    Arbiter.ingest() / toggleVerification()
        ↓
    ExampleStore.addOrUpdate()
        ↓
    classify_examples/{ledger}.json
        ↓
    下次分类时 PromptBuilder.retrieveRelevant()
        ↓
    注入 Prompt.context.reference_corrections
        ↓
    LLM 参考历史案例进行分类
```

---

## 存储位置

| 文件 | 位置 | 说明 |
|------|------|------|
| `classify_examples/{ledger}.json` | 沙箱 `Directory.Data` | 实例库数据 |

开发模式下查看路径：
```
virtual_android_filesys/sandbox_path/classify_examples/default.json
```

---

## 测试方法

### 浏览器控制台快速测试

```javascript
// 运行完整测试
await window.__DEBUG_TOOLS__.runP0Test()

// 查看实例库
await window.__DEBUG_TOOLS__.listExamples()

// 手动添加测试数据
await window.__DEBUG_TOOLS__.addTestExample()

// 测试检索
await window.__DEBUG_TOOLS__.testRetrieval()
```

### 集成测试

1. **用户修正分类场景**
   - 在 UI 中修改一条 AI 已分类的交易
   - 检查实例库是否自动写入（不含 `ai_reason`）

2. **用户锁定确认场景**
   - 在 UI 中锁定一条交易
   - 检查实例库是否自动写入（含 `ai_reason`）

3. **Prompt 注入验证**
   - 触发 AI 分类
   - 在 Network 面板检查请求体包含 `reference_corrections`

---

## 与设计的差异

| 设计文档 | 实际实现 | 原因 |
|----------|----------|------|
 设计预期 2-3 天 | 实际 1 天完成 | 复用现有架构（Arbiter、PersistenceManager），实现比预期顺利 |
| 预估工作量 | 实际更少 | 代码结构清晰，模块职责明确 |

---

## 下一步工作（P1）

P1 将实现**记忆文件 + 学习会话**机制：
- `classify_memory/{ledger}.md` - AI 归纳的模式记忆
- 学习会话 - 从实例库中提取模式，生成记忆条目
- 版本快照 - 每次写入前的备份机制
- 用户查看/编辑入口

详见设计文档：
- `AI_SELF_LEARNING_DESIGN_v4.md`
- `docs/P0_TEST_GUIDE.md`
