# PixelBill AI 自学习系统设计文档

**版本**: v4.2
**日期**: 2026-03-16
**状态**: ✅ P0、P1 已完成，P2、P3 规划中

---

## 一、设计目标

让 AI 越用越懂用户，无需反复调教。用户的唯一"教学"动作是修正分类。系统自动从修正行为中学习，下次遇到相似交易时做出更准确的判断。

**核心原则**：
- 用户操作越少越好——修正分类应该是唯一的必要动作
- AI 自由度越高越好——记忆内容由 AI 自主决定，不强制结构
- 一切用户交互都是学习信号——用户无感知地"教"AI

---

## 二、存储架构

每个账本独立维护以下数据，互不干扰。

### 2.1 结构化存储

#### 2.1.1 标签定义（`defined_categories`）

升级原有的数组为映射，每个标签强制附带一句自然语言描述：

```json
{
  "defined_categories": {
    "meal": "日常正餐支出（早午晚），仅限双人用餐，不含大餐和零食",
    "others": "所有非正餐支出，包括零食、饮品、交通、大餐、生活服务等"
  }
}
```

**三重作用**：
1. **冷启动锚点**：记忆文件为空时，AI 仅凭这句话也能做出基本合理的分类
2. **学习锚点**：学习 AI 以此为基准归纳规则，不会偏离用户定义的标签含义
3. **新增标签门槛**：用户新增标签时必须写至少一句描述，这是唯一的强制交互

#### 2.1.2 实例库（`classify_examples/{ledger}.json`）

存储用户修正过的或锁定确认的分类案例，作为 few-shot examples 注入分类 Prompt。

```json
[
  {
    "tx_id": "abc123",
    "created_at": "2026-01-15T19:40:00",
    "counterparty": "面包码头",
    "description": "芝士面包",
    "amount": 16.80,
    "direction": "out",
    "time": "19:40",
    "source": "wechat",
    "category": "others",
    "user_reason": "同时段已吃过杨国福，这是零食"
  }
]
```

**数据来源**（两种）：

| 来源 | 条件 | 说明 |
|------|------|------|
| 用户修正 | `user_category` 存在且 `user_category ≠ ai_category` | AI 分错了，用户纠正 |
| 用户锁定 | `is_verified === true` | 用户确认分类正确，高置信参考 |

**注入时的字段重组规则**：

账本文件（`*.pixelbill.json`）中每条交易存储原始四字段：`ai_category` / `ai_reasoning` / `user_category` / `user_note`。**写入实例库时即完成重组**，实例库中直接存储最多三个字段，确保实例库本身只包含"正确答案 + 正确理由"：

| 情况 | `category` | `ai_reason` | `user_reason` |
|------|-----------|-------------|---------------|
| AI 分对 + 用户锁定 | 最终落盘类别 | 保留 `ai_reasoning` | 有则保留 `user_note` |
| AI 分错 + 用户修正 | 最终落盘类别 | ❌ 丢弃（AI 判断错误，理由无参考价值） | 有则保留 `user_note` |
| 字段为空时 | — | 省略 | 省略 |

因此实例库中的每条记录，注入 Prompt 时无需再做转换，直接使用即可：
```json
{ "counterparty": "杨国福", "amount": 45, "time": "18:10",
  "category": "meal", "ai_reason": "餐饮商户，正餐时段，金额合理" }

{ "counterparty": "面包码头", "amount": 16.8, "time": "19:40",
  "category": "others", "user_reason": "同时段已吃过杨国福，这是零食" }
```

**检索逻辑**（批量级检索 + 去重合并）：

分类是按天（或多天）批量进行的，为每条交易单独附带案例会极大浪费 token。因此采用批量检索策略：

1. **逐条检索**：对批次中每条待分类交易，按以下优先级从实例库中检索最多 **3 条**相关案例：
   - **商户名匹配**（最高权重）：counterparty 关键词包含/被包含
   - **品类相似**：description / counterparty 的关键词交集
   - **金额区间**：实例金额在当前交易 ±50% 范围内优先
   - **时段相近**：同一餐点时段（早/午/晚/非餐点）优先
2. **去重合并**：将所有交易检索到的案例按 `tx_id` 去重，合并为一个统一的案例列表
3. **统一注入**：合并后的案例列表作为 `reference_corrections` 字段注入 User Message 的 `context` 对象中，而非跟随每条交易

> **设计考量**：实例库通常不会太大，且不同交易的检索结果重叠率较高（同一商户多次出现），去重后的总量可控。

**与交易记录的同步规则**：

一条交易被重新分类时（无论 AI 重分还是用户再次手改），先按 `tx_id` 查实例库，有则删除旧记录。如果用户对新结果又做了修正，自然产生新的实例记录。实例库永远与交易当前状态一致。

### 2.2 非结构化存储

#### 记忆文件（`classify_memory/{ledger}.md`）

AI 从用户修正行为中归纳出的模式认知。形式为**有序列表**，每条是一个独立信息点。

**文件格式约定**：文件中的**每一行视为一条有序列表项**。代码读取时按换行符 split，忽略空行，为每一行自动分配序号。写入时遍历加序号。无论用户把文件编辑成什么样子（删掉序号、打乱格式、插入空行），代码总能为每一行赋予一个稳定的序号。

**文件示例**：

```markdown
1. 我是西工大学生，和女朋友一起生活，meal只统计双人用餐
2. 单笔餐饮 > 70元视为大餐/聚餐，归 others
3. 同一餐点时段已有正餐，后续小吃/面包归 others
4. 大餐的补差价（即使金额很小）也归 others
5. 杨国福麻辣烫：正餐，通常 40-60 元
6. 益禾堂：奶茶饮品，归 others
7. 云上南山咖啡：虽是咖啡店但卖简餐，正餐时段+合理金额 → meal
```

**代码维护方式**：内存中为 `string[]`，读取时按行 split、去除序号前缀和空行，写入时遍历加序号。用户编辑后保存时，代码无条件地按行 split + 重编号，不尝试解析任何 Markdown 结构。

#### 自述文件（`PixelBill/self_description/user_profile.md`，全局）

用户手动维护的静态偏好描述，全局共享，不按账本隔离。存储于 `Documents/PixelBill/self_description/user_profile.md`，独立目录，不与账本 JSON 混放。

与记忆文件形成分层：**自述是全局人设，记忆文件是账本专属认知**。用户想告诉 AI 的通用信息（"我是西工大学生，和女朋友一起生活"）写在自述里；账本特定的分类规则由 AI 在记忆文件中自动归纳。

**与记忆文件的关系**：

| 维度 | 记忆文件 | 自述 |
|------|----------|------|
| 作用域 | 按账本隔离 | 全局共享 |
| 维护者 | AI 生成，用户可编辑 | 用户手动编写 |
| 内容 | AI 从修正行为中归纳的分类模式 | 用户想告诉 AI 的任何个人信息 |
| 设置页位置 | 账本设置区 | 全局设置区 |
| Prompt 注入优先级 | 正常 | **最高**——用户亲手写的描述优先于 AI 的归纳 |

**UI 展示**：设置页已有全局/账本两个分区，自述和 AI 记忆分别归入对应区域：

- **全局设置区**："自述 —— 让 AI 了解你"，自由文本框，标注"对所有账本生效，AI 会优先参考"
- **账本设置区**："AI 记忆"，有序列表编辑器，展示当前账本的 AI 归纳偏好。附带：
  - 当前累计修正数 / 学习阈值的显示
  - "立即学习"按钮
  - "历史版本"入口（快照浏览与回退）

**与旧字段的关系**：

| 旧字段/文件 | 处理方式 | 原因 |
|-------------|----------|------|
| `userContext`（secure_config.bin） | **迁移**至 `user_profile.md` | 从加密配置中拆出，改为可直接编辑的独立文件 |
| `classify_rules/{ledger}.md` | **废弃** | 记忆文件同时承担规则和认知职责 |

**用户编辑**：记忆文件区域展示有序列表，用户可直接增删改任意行，保存时代码自动按行 split + 重编号。即使用户完全破坏了格式，代码也能正确恢复为有序列表。自述区域为自由文本，无格式约束。

---

## 三、记忆文件维护机制

### 3.1 增量更新（常态操作）

学习 AI 输出结构化的操作指令：

```json
{
  "operations": [
    { "type": "ADD", "content": "便利店消费 > 20元 + 晚间无其他正餐 → meal" },
    { "type": "MODIFY", "index": 2, "content": "单笔餐饮 > 80元视为大餐（用户近期多次在70-80区间标记为meal）" },
    { "type": "DELETE", "index": 6 }
  ]
}
```

**代码执行**：

| 操作 | 实现 | 风险 |
|------|------|------|
| ADD | `list.push(content)` | 无——纯追加 |
| MODIFY | `list[index - 1] = content` | 极低——索引精确 |
| DELETE | `list.splice(index - 1, 1)` | 极低——索引精确 |

**注意**：当一次操作中同时包含 DELETE 和 MODIFY 时，必须**从高索引到低索引**倒序执行 DELETE，避免删除操作导致后续索引偏移。ADD 始终最后执行。

**变动前后对比**：

更新前的记忆文件：
```markdown
1. 我是西工大学生，和女朋友一起生活，meal只统计双人用餐
2. 单笔餐饮 > 70元视为大餐/聚餐，归 others
3. 同一餐点时段已有正餐，后续小吃/面包归 others
4. 大餐的补差价（即使金额很小）也归 others
5. 杨国福麻辣烫：正餐，通常 40-60 元
6. 益禾堂：奶茶饮品，归 others
7. 云上南山咖啡：虽是咖啡店但卖简餐，正餐时段+合理金额 → meal
```

执行上述操作后（MODIFY #2, DELETE #6, ADD 1条）：
```markdown
1. 我是西工大学生，和女朋友一起生活，meal只统计双人用餐
2. 单笔餐饮 > 80元视为大餐（用户近期多次在70-80区间标记为meal）  ← MODIFY
3. 同一餐点时段已有正餐，后续小吃/面包归 others
4. 大餐的补差价（即使金额很小）也归 others
5. 杨国福麻辣烫：正餐，通常 40-60 元
6. 云上南山咖啡：虽是咖啡店但卖简餐，正餐时段+合理金额 → meal  ← 原 #7，因 #6 被删除而上移
7. 便利店消费 > 20元 + 晚间无其他正餐 → meal                    ← ADD
```

执行完毕后自动重编号并写入文件。

**对学习 AI 的约束（写入其 System Prompt）**：

- **Schema 约束**：操作类型固定三种——ADD / MODIFY / DELETE，输出必须是合法 JSON
- **语义约束**：每条记忆是一个独立的信息点，用自然语言描述，无格式要求；一条只说一件事

### 3.2 版本快照机制

AI 拥有 MODIFY 和 DELETE 权限，用户也能任意编辑，任何一次改动都可能导致信息丢失。因此每次写入记忆文件前，必须先拍快照。

**快照存储**：沙箱目录（`Directory.Data`），不和 Documents 正式文件混在一起。

```
沙箱/memory_snapshots/{ledger}/
├── index.json              ← 快照索引
├── snap_001.md             ← 快照文件
├── snap_002.md
└── ...
```

**`index.json` 结构**：

```json
{
  "snapshots": [
    {
      "id": "snap_001",
      "timestamp": "2026-03-17T14:30:00",
      "trigger": "ai_learn",
      "summary": "学习会话：新增2条，修改1条"
    },
    {
      "id": "snap_002",
      "timestamp": "2026-03-17T15:10:00",
      "trigger": "user_edit",
      "summary": "用户手动编辑"
    }
  ]
}
```

**快照触发时机**——每次写入记忆文件之前，先把当前版本拍一份快照：

| 触发场景 | `trigger` 值 | `summary` |
|----------|-------------|-----------|
| 学习会话执行完操作指令 | `ai_learn` | 自动生成：本次操作摘要 |
| 收编完成 | `ai_compress` | "收编：N条 → M条" |
| 用户在编辑器点保存 | `user_edit` | "用户手动编辑" |
| 标签删除导致追加 | `tag_delete` | "标签 xxx 删除，追加失效标记" |

**执行流程**：任何代码路径要写入记忆文件 → 先读取当前文件 → 存为 `snap_{自增ID}.md` → 更新 `index.json` → 再执行实际写入。

**快照上限**：保留最近 30 个快照，超出后删除最旧的。

**回退操作**：回退不删除任何快照历史。执行回退时：先将当前记忆文件拍一个新快照（`trigger: "rollback"`，summary: "回退前的版本"），然后用选中的历史快照内容覆盖当前记忆文件。快照时间线始终只增不减，用户永远可以再次回退到回退之前的状态。

**UI**：设置页 "AI 记忆" 页面中，提供"历史版本"入口。点进去是快照列表，展示时间、触发类型、摘要。用户点击某条可预览内容，确认后回退。

### 3.3 收编（上下文压缩，低频操作）

当列表长度超过阈值（建议 30 条），触发收编。

**收编 Prompt**：
> *"以下是当前的分类记忆，共 N 条。请压缩到不超过 M 条，合并语义相近的条目，保留所有关键信息。输出新的完整有序列表，每条包含一个信息点。收编时允许合并多个信息点为一条。"*

**与标签删除的联动**：删除标签时会向记忆文件追加一条失效标记（如 `标签 "transport" 已从分类体系中移除，涉及该标签的规则不再适用`）。收编时需要特殊处理：

- 收编 Prompt 中额外注入当前的 `defined_categories`，让 AI 知道哪些标签现在存在
- 收编 AI 应当清理涉及已删除标签的规则条目，并移除失效标记本身
- **但如果被删除的标签后来又被重新添加了**，收编时该标签已经重新出现在 `defined_categories` 中，收编 AI 应当**保留**涉及该标签的规则内容，不做清理。这通过注入当前 `defined_categories` 自然实现——AI 看到标签存在，就不会丢弃相关规则

**执行流程**：
1. 拍快照（`trigger: "ai_compress"`）
2. 将完整列表 + 当前 `defined_categories` 交给 AI 压缩
3. AI 输出新列表，整体替换文件内容

这是**唯一做全量重写的时机**。如收编后分类效果变差，可通过快照回退。

---

## 四、完整工作流

### 4.1 用户修正分类（实时）

```
用户改分类
  → Arbiter 写入 USER 提案（已有逻辑）
  → 按 tx_id 查实例库，有旧记录则删除
  → 写入新的实例库记录
  → 累计修正数 +1
  → 检查：累计修正数 ≥ N？
      → 是：标记"待学习"（静默，不打扰用户）
      → 否：继续积累
```

**不弹窗、不打断用户**。用户修正分类时，系统只在后台默默积累。学习触发阈值 N（默认 5）的配置和"立即学习"按钮都收在设置页的账本设置区中。

### 4.2 学习会话（异步后台）

**触发时机**（两个稳定时机 + 手动）：

| 触发方式 | 条件 | 说明 |
|----------|------|------|
| **切换账本时** | 当前账本标记为"待学习" | 用户切换离开当前账本，是最自然的"一轮修正结束"信号 |
| **App 回到前台时** | 当前账本标记为"待学习" | 覆盖用户修正后锁屏/切走再回来的场景 |
| **手动触发** | 用户在设置页点击"立即学习" | 无需等待累计阈值，立即执行 |

**执行流程**：

```
检测到触发条件
  → 异步后台静默启动学习会话
  → 读取实例库全量 + 读取当前记忆文件（如有）
  → 发送给学习 AI（专用学习 Prompt）
  → 学习 AI 输出操作指令（ADD / MODIFY / DELETE）
  → 拍快照（trigger: "ai_learn"，summary: 本次操作摘要）
  → 代码执行指令，更新记忆文件
  → 清除"待学习"标记，修正计数归零
  → 检查列表长度，超阈值则触发收编
  → 顶部弹出轻量通知："AI 已学习新的分类偏好 ✓"
     持续 2-3 秒后自动收起，不阻塞任何用户操作
```

### 4.3 分类执行（由队列驱动）

分类不再由单一入口直接触发，而是通过任务队列统一调度（队列架构详见 5.6 节）。AI Engine 从队列中逐天取出任务，执行以下流程：

```
从队列取出一天的任务 { ledger, date, type }
  → 加载该天全部交易
  → 并行加载：
      ① classify_memory/{ledger}.md（模式记忆）
      ② classify_examples/{ledger}.json
         → 对该天每条交易检索最多3条相关案例
         → 按 tx_id 去重合并为统一案例列表
      ③ defined_categories（标签定义）
      ④ self_description/user_profile.md（自述，全局）
  → 拼接最终 Prompt（见第六节）
  → 调用 LLM
  → 解析结果 → Arbiter.ingest()（锁定条目受保护）
  → UI 光效：type === "normal" ? 绿色 : 黄色
```

---

## 五、标签变更处理

### 5.1 `is_verified`（锁定）的语义

**铁律**：`is_verified === true` 的交易不被任何自动化流程覆盖。唯一破壁条件：该交易的标签被删除。

### 5.2 新增标签

**数据处理**：不自动修改任何现有数据。

**用户交互（渐进式披露）**：

```
新增标签完成
  → 弹窗："需要重新分类吗？"
      → [暂时跳过] → 结束
      → [现在重新分类] →
          弹窗："选择重新分类范围"
            → [仅未分类的交易]
            → [全量（未锁定的交易）] →
                展示锁定交易列表，允许用户当场解锁
                → 用户确认 → 执行重分类
```

### 5.3 删除标签

**数据处理**：

| 步骤 | 对象 | 操作 |
|------|------|------|
| 1 | 受影响交易（`category === 被删标签`） | `category → "uncategorized"`，`source → FALLBACK`，`is_verified → false`（强制解锁） |
| 2 | 实例库 | 删除所有 `category === 被删标签` 的记录 |
| 3 | 记忆文件 | 追加一条：`标签 "xxx" 已从分类体系中移除，涉及该标签的规则不再适用`（此条为临时失效标记，下次收编时由 AI 根据当前 `defined_categories` 决定是否清理相关规则——如果该标签被重新添加，则保留） |

**用户交互（渐进式披露）**：

```
删除标签完成，数据处理执行完毕
  → 弹窗："受影响的 X 条交易已设为未分类。需要重新分类吗？"
      → [暂时跳过] → 结束
      → [现在重新分类] →
          弹窗："选择重新分类范围"
            → [仅受影响的交易（原属于被删标签）]
            → [全量（所有未锁定的交易）] →
                展示锁定交易列表，允许用户当场解锁
                → 用户确认 → 执行重分类
```

### 5.4 重命名标签

**数据处理**：四处批量字符串替换——交易记录、实例库、记忆文件文本、`defined_categories`。

**不触发重分类，不影响锁定状态。**

### 5.5 修改标签描述

**数据处理**：仅更新 `defined_categories` 中的描述文本。

**用户交互**：

```
描述修改完成
  → 弹窗："标签定义已更改，需要重新分类吗？"
      → [暂时跳过] → 结束
      → [现在重新分类] →
          弹窗："选择重新分类范围"
            → [仅该标签下的未锁定交易]
            → [全量（所有未锁定的交易）] →
                展示锁定交易列表，允许用户当场解锁
                → 用户确认 → 执行重分类
```

### 5.6 分类任务队列架构

正常分类和重分类共用一套 AI Engine 管道（投喂全天交易、AI 输出全天结果、Arbiter 保护锁定条目），但在**日期筛选、实例库预清理、UI 光效**三个维度上有区别。通过任务队列 + 触发层实现解耦。

#### 5.6.1 队列设计

```
┌──────────────────────────────────────────────────┐
│               分类任务队列（持久化到沙箱）          │
│  每个元素 = { ledger, date, type }                 │
│                                                   │
│  type 取值：                                      │
│  - "normal"           正常分类（绿色光效）         │
│  - "reclassify_full"  全量重分类（黄色光效）       │
│  - "reclassify_affected" 仅受影响条目（黄色光效）  │
│  - "reclassify_scoped"   仅指定标签（黄色光效）    │
└───────────────────────┬──────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────┐
│                  AI Engine（消费者）               │
│  当前：一次消费一天                                │
│  未来：可一次消费多天                              │
│                                                   │
│  投喂方式统一：该天全部交易打包                    │
│  AI 为全部交易输出分类结果                         │
│  结果应用统一：ai_category 全覆盖，                │
│              Arbiter 保护 is_verified 条目          │
│  光效颜色：根据 type 切换（normal=绿 / 其他=黄）   │
└──────────────────────────────────────────────────┘
```

**队列持久化**：存于沙箱 `classify_queue.json`，App 重启后继续消费，避免用户确认的重分类任务因关闭 App 而丢失。

**队列去重规则**：同一账本同一天已在队列中时——如果新任务优先级更高则升级，否则跳过。优先级：`reclassify_full` > `reclassify_affected` / `reclassify_scoped` > `normal`。

#### 5.6.2 触发层设计

所有复杂的日期筛选和实例库预清理都在**入队之前**完成。触发层为每种场景提供独立函数，逻辑自洽。

**日期筛选辅助判定**：

- "该天有未分类且未锁定的条目"：`is_verified === false && (category 为空 || category === "uncategorized")`
- "该天曾被 AI 处理过"：该天至少有一条交易的 `ai_category` 非空

**各场景的触发逻辑**：

**CSV 导入**：
```
扫描导入涉及的日期
  → 筛选：该天有未分类且未锁定的条目
  → 入队 type: "normal"
```

**新增标签 → 用户选"仅未分类"**：
```
扫描全量日期
  → 筛选：该天有未分类且未锁定的条目
  → 入队 type: "normal"（本质就是正常分类）
```

**新增标签 → 用户选"全量"**：
```
扫描全量日期
  → 筛选：该天有未锁定条目 且 该天曾被 AI 处理过
  → 预清理：入选日期中所有未锁定条目按 tx_id 清理实例库
  → 入队 type: "reclassify_full"
```

**删除标签 → 用户选"仅受影响"**：
```
（前置操作已完成：重置条目、清理实例库、记录受影响的日期列表）
  → 入队 type: "reclassify_affected"，使用前置操作记录的日期
```

**删除标签 → 用户选"全量"**：
```
扫描全量日期
  → 筛选：该天有未锁定条目 且 该天曾被 AI 处理过
  → 预清理：入选日期中所有未锁定条目按 tx_id 清理实例库
  → 入队 type: "reclassify_full"
```

**修改标签描述 → 用户选"仅该标签"**：
```
扫描全量日期
  → 筛选：该天有该标签的未锁定条目 且 该天曾被 AI 处理过
  → 预清理：入选日期中该标签的未锁定条目按 tx_id 清理实例库
  → 入队 type: "reclassify_scoped"
```

**修改标签描述 → 用户选"全量"**：
```
（同新增标签全量逻辑）
  → 入队 type: "reclassify_full"
```

**学习完成 → 用户确认重分类**：
```
（同新增标签全量逻辑）
  → 入队 type: "reclassify_full"
```

**手动触发重分类**：
```
（同新增标签全量逻辑）
  → 入队 type: "reclassify_full"
```

#### 5.6.3 正常分类 vs 重分类对比

| 维度 | 正常分类（normal） | 重分类（reclassify_*） |
|------|-------------------|----------------------|
| 日期筛选 | 该天有未分类且未锁定条目 | 按场景不同（见上） |
| 排除从未处理的天 | 不适用 | ✅ 该天需曾被 AI 处理过 |
| 实例库预清理 | 无 | 在触发层完成（入队前） |
| 投喂内容 | 该天全部交易 | 该天全部交易（相同） |
| AI 输出 | 全部交易的分类结果 | 全部交易的分类结果（相同） |
| 结果应用 | ai_category 全覆盖 | ai_category 全覆盖（相同） |
| 锁定保护 | Arbiter 保护 | Arbiter 保护（相同） |
| UI 光效 | 🟢 绿色 | 🟡 黄色 |

**代码分离点**：触发层（日期筛选 + 预清理）独立于 AI Engine。AI Engine 只看队列中的 `{ date, type }`，不关心"为什么要分类"。

### 5.7 所有场景 vs is_verified 交互矩阵

| 操作 | 未锁定交易 | 已锁定交易 |
|------|-----------|-----------|
| CSV 导入新交易 | 正常分类 | 不适用 |
| 新增标签 → 仅未分类 | 正常分类 | 不适用 |
| 新增标签 → 全量 | 重分类 | **不参与**，除非用户主动解锁 |
| 删除标签 | 重置 + 可选重分类 | **强制解锁** → 重置 → 可选重分类 |
| 重命名标签 | 批量改名 | 批量改名（不影响锁定） |
| 修改标签描述 → 仅该标签 | 该标签下重分类 | **不参与**，除非用户主动解锁 |
| 修改标签描述 → 全量 | 重分类 | **不参与**，除非用户主动解锁 |
| 学习完成 → 重分类 | 重分类 | **不参与** |
| 手动触发重分类 | 重分类 | **不参与**，除非用户先手动解锁 |

---

## 六、Prompt 拼接方案

### 6.1 分类 System Prompt（完整静态部分）

以下为新版 System Prompt 的完整静态部分。动态部分（自述、记忆文件）在代码中拼接时插入到指定位置。

```typescript
export interface SystemPromptConfig {
  language?: string;
  /** 用户自述（全局，来自 self_description/user_profile.md） */
  selfDescription?: string;
  /** AI 记忆（按账本，来自 classify_memory/{ledger}.md） */
  memory?: string;
}

export const generateSystemPrompt = (config: SystemPromptConfig = { language: '简体中文' }) => {

  // 动态段：自述（全局）
  const selfDescriptionSection = config.selfDescription?.trim()
    ? `\n### Self-Description\nThe user has written the following self-description. This has the HIGHEST priority — follow it unconditionally, even if it conflicts with the learned memory below.\n${config.selfDescription.trim()}\n`
    : '';

  // 动态段：AI 记忆（按账本）
  const memorySection = config.memory?.trim()
    ? `\n### Learned Preferences\nThe following is a numbered list of classification patterns learned from the user's past corrections. Use these as strong guidance for your decisions.\n${config.memory.trim()}\n`
    : '';

  return `You are PixelBill, an advanced AI financial assistant specializing in personalized transaction categorization. You will receive the user's expense categories with descriptions, reference corrections from past interactions, and transaction records grouped by day. Your goal is to fully understand the user's personalized category definitions and classify every single transaction accordingly.

### Input Format
The user will provide a JSON object with the following structure:
- **category_list**: An object mapping category keys to their natural-language descriptions (e.g., {"meal": "Daily meals for two...", "others": "Everything else..."}). You MUST only use keys from this object.
- **context**: An object containing background information:
  - \`date\`: The date of the transactions (YYYY-MM-DD).
  - \`weekday\`: The day of the week (e.g., "Monday").
  - \`reference_corrections\`: An array of past classification corrections. Each entry contains a transaction's key fields plus the confirmed correct \`category\`, and optionally \`ai_reason\` (AI's reasoning when it got it right) or \`user_reason\` (user's explanation when correcting the AI). When you encounter a transaction similar to a reference correction, you MUST follow the correction.
- **transactions**: An array of transaction objects to be categorized. Each object contains:
  - \`id\`: Unique transaction identifier.
  - \`time\`: Time of transaction.
  - \`amount\`: Transaction amount.
  - \`direction\`: "in" (income) or "out" (expense).
  - \`counterparty\`: The merchant or person involved.
  - \`description\`: Product name or remark.
  - \`source\`: Payment source (e.g., wechat, alipay).
  - \`raw_category\`: The original category from the payment platform (for reference only).

### Output Format
You MUST return a strictly valid JSON object. No markdown formatting, no introductory text.
\`\`\`json
{
  "date": "YYYY-MM-DD",
  "results": [
    {
      "id": "transaction_id",
      "category": "category_key",
      "reasoning": "Brief explanation in ${config.language}."
    }
  ]
}
\`\`\`

### Core Responsibilities
1. **Analyze**: Examine transaction descriptions, amounts, times, and counterparties to accurately categorize expenses.
2. **Follow corrections**: When a transaction is similar to a \`reference_corrections\` entry (same counterparty, similar amount/time pattern), follow that correction. This is your strongest signal.
3. **Apply learned preferences**: The "Learned Preferences" section (if present) contains patterns extracted from the user's history. Treat these as reliable rules unless a specific reference correction contradicts them.
4. **Respect self-description**: The "Self-Description" section (if present) is written by the user directly. It has the highest authority — follow it even if it conflicts with learned preferences.
5. **Category selection**: The \`category\` field MUST strictly match a key from \`category_list\`. Do not translate, paraphrase, or invent new categories.
6. **Reasoning language**: The \`reasoning\` field MUST be written in ${config.language}.
7. **Infer when needed**: If no correction, preference, or self-description applies, use logical inference based on the description, amount, time, and \`raw_category\`.

### Priority Hierarchy
When information sources conflict, follow this priority (highest to lowest):
1. **Self-Description** — user's direct instructions, unconditional
2. **Reference Corrections** — proven correct classifications from past interactions
3. **Learned Preferences** — patterns generalized from corrections
4. **Your own inference** — common sense and contextual reasoning

### Behavioral Guidelines
- Output strictly JSON only. No markdown fences, no introductory text.
- Remain objective and non-judgmental about spending habits.
- When a transaction is ambiguous, choose the most logical category. Explain your reasoning.
- Consider time-of-day context: consecutive transactions near the same time may be related (e.g., a small payment right after a large meal could be a supplement).
${selfDescriptionSection}${memorySection}`;
};
```

### 6.2 User Message 结构

```json
{
  "category_list": {
    "meal": "日常正餐支出（早午晚），仅限双人用餐，不含大餐和零食",
    "others": "所有非正餐支出，包括零食、饮品、交通、大餐、生活服务等"
  },

  "context": {
    "date": "2026-01-15",
    "weekday": "Thursday",
    "reference_corrections": [
      {
        "counterparty": "面包码头",
        "amount": 16.80,
        "time": "19:40",
        "category": "others",
        "user_reason": "同时段已吃过杨国福"
      },
      {
        "counterparty": "杨国福",
        "amount": 45.00,
        "time": "18:10",
        "category": "meal",
        "ai_reason": "餐饮商户，正餐时段，金额合理"
      }
    ]
  },

  "transactions": [
    { "待分类交易列表，同现有格式" }
  ]
}
```

### 6.3 关键变更总结

| 变更项 | 旧版 | 新版 |
|--------|------|------|
| `category_list` | 字符串数组 | 映射（key → 描述） |
| `user_rules` 字段 | Markdown 规则文件 | **移除**，被记忆文件替代 |
| `userContext` | System Prompt 中的静态文本段 | **重命名为 Self-Description**，迁移至独立文件 |
| 记忆文件 | 不存在 | **新增**，注入为 Learned Preferences 段 |
| 实例库 | 不存在 | **新增**，注入为 `context.reference_corrections` |
| 优先级层次 | 未明确 | **新增**，四级优先级明确写入 Prompt |

### 6.4 学习 System Prompt（完整）

```typescript
export interface LearningPromptConfig {
  /** 当前分类体系（defined_categories 的 JSON） */
  categories: Record<string, string>;
  /** 当前记忆文件内容（可能为空） */
  currentMemory?: string;
}

export const generateLearningSystemPrompt = (config: LearningPromptConfig) => {
  const memorySection = config.currentMemory?.trim()
    ? `\n### Current Memory (Numbered List)\n${config.currentMemory.trim()}\n`
    : '\n### Current Memory\n(Empty — no learned preferences yet.)\n';

  return `You are a pattern analyst for PixelBill, a personal finance app. Your task is to analyze the user's classification corrections and extract generalizable rules and preferences.

### Your Role
The user has been correcting the AI classifier's mistakes. Each correction record shows what the AI predicted, what the user changed it to, and optionally why. Your job is to identify patterns in these corrections and update the memory file accordingly.

### Category System
The following categories are currently defined:
${JSON.stringify(config.categories, null, 2)}

Only reference categories that exist in this list. If a correction references a category not in this list, it may be outdated — do not create rules for non-existent categories.
${memorySection}
### Output Format
You MUST return a strictly valid JSON object. No markdown formatting, no introductory text.

\`\`\`json
{
  "operations": [
    { "type": "ADD", "content": "..." },
    { "type": "MODIFY", "index": 3, "content": "..." },
    { "type": "DELETE", "index": 5 }
  ]
}
\`\`\`

### Operation Types
- **ADD**: Append a new insight. Provide \`content\` (a single information point in natural language).
- **MODIFY**: Update an existing entry. Provide \`index\` (the line number in the current memory) and \`content\` (the replacement text).
- **DELETE**: Remove an entry that is no longer accurate or has been superseded. Provide \`index\` (the line number).

### Rules
1. Each memory entry must be a single, self-contained information point. One entry = one insight.
2. Do not duplicate information already present in the current memory.
3. Prefer MODIFY over DELETE+ADD when updating an existing rule (e.g., changing a threshold).
4. If corrections contradict an existing memory entry, MODIFY or DELETE it.
5. Focus on generalizable patterns, not individual transactions. "杨国福 at 45 yuan was meal" is a correction; "Fast food restaurants under 70 yuan during meal hours → meal" is a pattern.
6. If the corrections don't reveal any new pattern, return an empty operations array: \`{"operations": []}\`
7. Write entries in the same language the user uses (typically Chinese).
`;
};

export const buildLearningUserMessage = (corrections: object[]) => {
  return `以下是用户最近的分类修正记录：

${JSON.stringify(corrections, null, 2)}

请分析这些修正，输出你建议的记忆更新操作。`;
};
```

### 6.5 收编 System Prompt（完整）

```typescript
export interface CompressPromptConfig {
  /** 当前分类体系（defined_categories 的 JSON） */
  categories: Record<string, string>;
  /** 当前记忆文件内容 */
  currentMemory: string;
  /** 当前条目数 */
  currentCount: number;
  /** 压缩目标条目数 */
  targetCount: number;
}

export const generateCompressSystemPrompt = (config: CompressPromptConfig) => {
  return `You are a memory compressor for PixelBill, a personal finance app. Your task is to compress a numbered list of classification preferences while preserving all essential information.

### Category System
The following categories are currently defined:
${JSON.stringify(config.categories, null, 2)}

### Rules
1. The current memory has ${config.currentCount} entries. Compress it to no more than ${config.targetCount} entries.
2. Merge semantically similar entries into one. For example, multiple merchant-specific rules for the same pattern can be combined.
3. Preserve ALL key information — thresholds, exceptions, special cases. Do not silently drop rules.
4. If an entry references a category that does NOT exist in the category system above, it is outdated. Remove it and do not preserve its content.
5. If an entry is a "tag deleted" marker (e.g., "标签 xxx 已从分类体系中移除..."), check whether that tag now exists again in the category system. If it does, remove only the marker but KEEP any related rules. If it does not, remove both the marker and all related rules.
6. Each output entry must be a single, self-contained information point.
7. Write entries in the same language as the input (typically Chinese).

### Output Format
Output ONLY the compressed numbered list as plain text, one entry per line, with sequential numbers. No JSON, no markdown fences, no commentary.

Example output:
1. First compressed entry
2. Second compressed entry
3. Third compressed entry
`;
};

export const buildCompressUserMessage = (currentMemory: string) => {
  return `以下是当前的分类记忆，请进行压缩：

${currentMemory}`;
};
```

---

## 七、用户交互设计

### 7.1 当前修正方式（已实现）

**场景**：用户看到一条分错的交易。

**交互流程**：

```
用户点击交易条目 → 进入交易详情页
  → 点击分类区域 → 标签轮盘弹出
  → 选择正确分类 → 分类立即生效
  → 可选：在详情页填写用户备注（user_note）
  → 返回列表
```

**优点**：逻辑完整，所有信息都能采集到。

**不足**：需要进入详情页才能改分类，操作路径偏长；填写备注是独立步骤，容易被忽略。

### 7.2 快速修正层（规划中，非比赛核心）

**目标**：将修正摩擦力降到最低，让用户在列表页就能完成修正 + 可选补充理由。

**交互流程**：

```
用户在交易列表直接点击分类标签
  → 标签轮盘弹出，选择正确分类
  → 分类立即生效（无需进入详情页）
  → 底部浮现轻量提示条：
      "想告诉 AI 为什么改吗？"
      [🎤 语音] [✏️ 文字] [× 关闭]
  → 3秒后自动消失
  → 用户选择忽略：仅记录标签变更，user_note 为空
  → 用户选择输入：语音转文字或直接输入 → 存入 user_note
```

**设计哲学**：修正分类的摩擦力趋近于零，提供理由是锦上添花而非必须。

**工作量评估**：
- 列表页内联标签轮盘（需改造现有列表组件交互）：约 1-2 天
- 底部提示条 + 文字输入：约 0.5 天
- 语音输入（需集成语音转文字能力）：约 1-2 天
- **总计约 3-4 天**，其中语音输入可进一步延后

### 7.3 深度对话层（远期规划，比赛期间不实现）

**场景**：用户长按某条交易，唤出对话式界面。

**交互流程**：
1. AI 展示分类逻辑："我把这笔归为 meal，因为..."
2. 用户语音/文字反馈："不对，因为..."
3. AI 理解后更新分类 + 生成高质量实例记录

**价值**：获取最高质量的学习信号。作为答辩时的"技术展望"展示。

### 7.4 AI 记忆查看/编辑

详见 2.2 节的 UI 展示说明。入口分布在设置页的两个分区中：

- **全局设置区**："自述 —— 让 AI 了解你"
- **账本设置区**："AI 记忆"（有序列表编辑器 + 立即学习 + 历史版本）

---

## 八、实施优先级

**比赛剩余约 26 天，按递进顺序实施：**

### P0：实例库自动采集 + 注入（✅ 已完成）

**实施日期**: 2026-03-16
**实际工作量**: 约 1 天

**已完成内容**:
- ✅ `ExampleStore` 模块：`src/core/services/ExampleStore.ts`
  - 实例库 CRUD 操作（沙箱 `classify_examples/{ledger}.json`）
  - 智能检索算法（商户名、品类、金额区间、时段匹配）
  - 字段重组（区分 AI 分对/分错的情况）
- ✅ `Arbiter` 集成：用户修正/锁定时自动触发实例库写入
- ✅ `PromptBuilder` 集成：分类前批量检索案例，注入 `reference_corrections`
- ✅ `SystemPrompt` 更新：新增四级优先级层次和 reference_corrections 使用指引
- ✅ 调试工具：浏览器控制台支持 `window.__DEBUG_TOOLS__.runP0Test()`

**调试工具**:
```javascript
// 运行 P0 完整测试
await window.__DEBUG_TOOLS__.runP0Test()

// 查看实例库
await window.__DEBUG_TOOLS__.listExamples()

// 添加测试数据
await window.__DEBUG_TOOLS__.addTestExample()

// 测试检索功能
await window.__DEBUG_TOOLS__.testRetrieval()

// 清空实例库
await window.__DEBUG_TOOLS__.clearExamples()
```

**相关文档**:
- 测试指南：`docs/P0_TEST_GUIDE.md`
- 实现总结：`docs/P0_IMPLEMENTATION_SUMMARY.md`

**实现细节变更**:
- 实例库存储位置：`Directory.Data/classify_examples/{ledger}.json`
- 检索策略：每条交易最多 3 条案例，全局去重合并
- 匹配权重：商户名(50) > 品类相似(20) > 金额区间(15) > 时段(15)

### P1：记忆文件 + 学习会话（✅ 已完成）

**实施日期**: 2026-03-16
**实际工作量**: 约 1 天

**已完成内容**:
- ✅ `MemoryManager` 模块：`src/core/services/MemoryManager.ts`
  - 记忆文件读写（Documents/PixelBill/classify_memory/{ledger}.md）
  - 增量更新（ADD / MODIFY / DELETE）
  - 有序列表格式解析与生成
  - **关键实现**: DELETE/MODIFY 按索引降序执行，避免偏移问题
- ✅ `SnapshotManager` 模块：`src/core/services/SnapshotManager.ts`
  - 版本快照（沙箱 memory_snapshots/{ledger}/）
  - 上限清理（保留 30 个）
  - 回退功能（回退前自动拍新快照）
- ✅ `LearningSession` 模块：`src/core/ai_engine/LearningSession.ts`
  - 学习 Prompt 生成
  - LLM 调用与操作指令解析
  - 自动拍快照后执行更新
- ✅ `SelfDescriptionManager` 模块：`src/core/services/SelfDescriptionManager.ts`
  - 自述文件独立管理
  - 向后兼容旧配置（自动迁移）
- ✅ `ConfigManager` 更新：`src/core/config/ConfigManager.ts`
  - `getUserContext()` / `saveUserContext()` / `migrateUserContext()`
  - 新旧配置兼容
- ✅ `SettingsPage` 更新：`src/components/mobile/SettingsPage.tsx`
  - AI 记忆面板（修正计数、学习阈值、立即学习按钮）
  - 历史版本浏览与回退
  - 当前记忆内容展示
  - 自述文件编辑区
- ✅ `PromptBuilder` 更新：`src/core/llm_service/prompt/PromptBuilder.ts`
  - 注入记忆文件到 System Prompt
  - 同时加载自述文件和记忆文件

**调试工具**:
```javascript
// 运行 P1 完整测试
await window.__DEBUG_TOOLS__.runP1Test()

// 记忆文件操作
await window.__DEBUG_TOOLS__.loadMemories()
await window.__DEBUG_TOOLS__.addMemory('新记忆')
await window.__DEBUG_TOOLS__.modifyMemory(1, '修改后')
await window.__DEBUG_TOOLS__.deleteMemory(1)

// 快照操作
await window.__DEBUG_TOOLS__.listSnapshots()
await window.__DEBUG_TOOLS__.createSnapshot('测试')
await window.__DEBUG_TOOLS__.rollbackSnapshot('snap_001')

// 自述文件
await window.__DEBUG_TOOLS__.loadSelfDesc()
await window.__DEBUG_TOOLS__.saveSelfDesc('我是西工大学生...')

// 清理数据
await window.__DEBUG_TOOLS__.clearP1Data()
```

**相关文档**:
- 测试指南：`docs/P1_TEST_GUIDE.md`
- 实现总结：`docs/P1_IMPLEMENTATION_SUMMARY.md`

**实现细节变更**:
- 记忆文件位置：`Documents/PixelBill/classify_memory/{ledger}.md`
- 快照位置：`沙箱/memory_snapshots/{ledger}/`
- 自述文件位置：`Documents/PixelBill/self_description/user_profile.md`
- 索引偏移处理：DELETE/MODIFY 操作按索引降序执行
- 回退机制：回退前先拍新快照，保留完整历史

### P2：标签管理升级 + 分类队列（预估 3-4 天）

- `defined_categories` 升级为映射
- 标签增删改的连锁处理
- 分类任务队列基础设施（ClassifyQueue + ClassifyTrigger）
- 渐进式重分类交互（含各场景的触发逻辑）
- 账本管理器扩展（删除/重命名时清理关联文件）

### P3：快速修正层——列表页内联修正（预估 1-2 天）

- 列表页直接点击标签触发轮盘（无需进入详情页）
- 修正后的轻量提示条（文字输入补充理由）
- 不含语音输入（语音输入延后）

### 延后（比赛后）

- 快速修正层——语音输入（预估 1-2 天额外工作量）
- 收编（上下文压缩）机制
- 深度对话层
- 跨账本学习
- 收编质量自动检测与回滚

---

## 九、存储位置总览

### 9.1 文件分布

| 文件 | 存储位置 | Directory 枚举 | 作用域 | 说明 |
|------|----------|----------------|--------|------|
| `ledgers.json` | 沙箱 | `Directory.Data` | 全局 | 账本索引，已有 |
| `*.pixelbill.json` | `Documents/PixelBill/` | `Directory.Documents` | 按账本 | 账本数据，已有 |
| `secure_config.bin` | 沙箱 | `Directory.Data` | 全局 | 加密配置（API 密钥等），已有 |
| `user_profile.md` | `Documents/PixelBill/self_description/` | `Directory.Documents` | 全局 | **新增**：自述文件，用户手写偏好，独立目录便于用户识别 |
| `classify_memory/{ledger}.md` | `Documents/PixelBill/classify_memory/` | `Directory.Documents` | 按账本 | **新增**：AI 记忆文件 |
| `classify_examples/{ledger}.json` | 沙箱 `classify_examples/` | `Directory.Data` | 按账本 | **新增**：实例库 |
| `memory_snapshots/{ledger}/` | 沙箱 `memory_snapshots/` | `Directory.Data` | 按账本 | **新增**：记忆文件快照 |
| `classify_queue.json` | 沙箱 | `Directory.Data` | 全局 | **新增**：分类任务队列，App 重启后继续消费 |

**分布原则**：用户需要直接访问/编辑的 → Documents；纯系统内部维护的 → 沙箱。

### 9.2 账本管理器连锁变更

现有的账本管理器在创建/删除账本时，只操作 `ledgers.json` 和 `*.pixelbill.json`。新增文件意味着生命周期事件需要扩展：

**创建账本**：不需要预创建新文件。记忆文件和实例库在首次需要时按需创建（第一次学习会话 / 第一次用户修正时）。

**删除账本**：

```
删除账本 "{ledger}"
  → [已有] 删除 Documents/PixelBill/{ledger}.pixelbill.json
  → [新增] 删除 Documents/PixelBill/classify_memory/{ledger}.md（如存在）
  → [新增] 删除 沙箱/classify_examples/{ledger}.json（如存在）
  → [新增] 删除 沙箱/memory_snapshots/{ledger}/ 整个目录（如存在）
  → [新增] 从 classify_queue.json 中移除该账本的所有待处理任务
  → [已有] 更新 ledgers.json 索引
```

**重命名账本**：

```
重命名账本 "{old}" → "{new}"
  → [已有] 重命名 {old}.pixelbill.json → {new}.pixelbill.json
  → [新增] 重命名 classify_memory/{old}.md → classify_memory/{new}.md（如存在）
  → [新增] 重命名 classify_examples/{old}.json → classify_examples/{new}.json（如存在）
  → [新增] 重命名 memory_snapshots/{old}/ → memory_snapshots/{new}/（如存在）
  → [已有] 更新 ledgers.json 索引
```

所有新增文件操作都带"如存在"判断——新账本可能尚未产生学习/修正，文件不一定存在。

> **注意**：自述文件（`user_profile.md`）为全局文件，不参与账本级别的生命周期管理。

---

## 十、与现有架构的兼容性

### 10.1 已修改/新增模块状态

| 模块 | 变更内容 | 状态 |
|------|----------|------|
| `PromptBuilder.ts` | 重构 Prompt 拼接逻辑，接入自述、记忆文件和实例库 | ✅ P0/P1 已完成 |
| `SystemPrompt.ts` | 新增 Self-Description / Learned Preferences 动态段、四级优先级层次 | ✅ P0/P1 已完成 |
| `Arbiter` | 修正写入时同步更新实例库 | ✅ P0 已完成 |
| `ConfigManager` | 新增用户上下文接口，支持自述文件迁移 | ✅ P1 已完成 |
| `SettingsPage` | 新增 AI 记忆面板、历史版本、阈值配置 | ✅ P1 已完成 |
| `LedgerService` | 新增标签管理 API（增删改 + 连锁处理）；账本创建/删除/重命名扩展 | 🚧 P2 规划中 |
| `ClassifyQueue` | 分类任务队列（持久化、去重、优先级升级） | 🚧 P2 规划中 |
| `ClassifyTrigger` | 触发层——各场景的日期筛选、实例库预清理、入队逻辑 | 🚧 P2 规划中 |

### 10.2 新增模块状态

| 模块 | 职责 | 路径 | 状态 |
|------|------|------|------|
| `ExampleStore` | 实例库的 CRUD + 批量检索逻辑 | `src/core/services/ExampleStore.ts` | ✅ P0 已完成 |
| `MemoryManager` | 记忆文件的读取、增量更新 | `src/core/services/MemoryManager.ts` | ✅ P1 已完成 |
| `SnapshotManager` | 快照的创建、索引维护、回退执行、上限清理 | `src/core/services/SnapshotManager.ts` | ✅ P1 已完成 |
| `SelfDescriptionManager` | 自述文件的读取、写入、迁移 | `src/core/services/SelfDescriptionManager.ts` | ✅ P1 已完成 |
| `LearningSession` | 学习会话的编排（Prompt 构建、结果执行） | `src/core/ai_engine/LearningSession.ts` | ✅ P1 已完成 |
| `ClassifyQueue` | 分类任务队列（持久化、去重、优先级升级） | - | 🚧 P2 规划中 |
| `ClassifyTrigger` | 触发层——各场景的日期筛选、实例库预清理、入队逻辑 | - | 🚧 P2 规划中 |

### 10.3 不需要修改的模块

- CSV Parser
- Mock 层
- UI 组件（除标签管理、AI 记忆页、修正交互外）
- 网络层 / LLMClient

---

---

## 十一、文档更新历史

### v4.2 (2026-03-16)
- 更新状态：P0、P1 已完成
- 新增 P0/P1 调试工具使用说明
- 新增相关文档链接（测试指南、实现总结）
- 更新模块实现状态表
- 补充 P1 实现细节（索引偏移处理、回退机制）

### v4.1 (2026-03-16)
- 初始完整设计文档
- 包含 P0-P3 完整规划
- 详细 Prompt 设计方案
- 存储架构与数据流设计

---

**文档完成。**
**下一步**：P2 标签管理升级 + 分类队列实施
