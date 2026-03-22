# P1: 记忆文件 + 学习会话 - 实现总结

**实施日期**: 2026-03-16
**状态**: ✅ 已完成

---

## 实现概览

P1 是 PixelBill AI 自学习系统的第二阶段，实现了**记忆文件管理**、**版本快照**、**用户自述独立存储**以及**学习会话机制**。

核心目标：让 AI 能够从大量修正记录中自动归纳学习，生成可解释、可管理的偏好记忆，并支持用户查看、编辑和版本回退。

---

## 新增模块

### 1. MemoryManager (`src/core/services/MemoryManager.ts`)

记忆文件管理模块，负责：
- 记忆文件的读写（`Documents/PixelBill/classify_memory/{ledger}.md`）
- 增量更新操作（ADD / MODIFY / DELETE）
- 文件格式：有序列表，每行一个信息点

**关键接口**:
```typescript
// 加载记忆文件（返回 string[]）
MemoryManager.load(ledgerName)

// 保存记忆文件（覆盖写入）
MemoryManager.save(ledgerName, memories)

// 执行增量操作（自动处理索引偏移）
MemoryManager.applyOperations(ledgerName, operations)

// 单条操作快捷方法
MemoryManager.add(ledgerName, content)
MemoryManager.modify(ledgerName, index, content)
MemoryManager.delete(ledgerName, index)
```

**索引偏移处理**:
```typescript
// DELETE 和 MODIFY 按索引降序执行，避免偏移问题
deletes.sort((a, b) => b.index - a.index).forEach(op => {
  if (op.index >= 1 && op.index <= memories.length) {
    memories.splice(op.index - 1, 1);
  }
});
```

---

### 2. SnapshotManager (`src/core/services/SnapshotManager.ts`)

版本快照管理模块，负责：
- 快照存储（沙箱 `memory_snapshots/{ledger}/`）
- `index.json` 索引管理（id, timestamp, trigger, summary）
- 自动备份：写入记忆文件前自动创建快照
- 回退功能：用历史快照覆盖当前记忆文件
- 上限清理：保留最近 30 个快照

**关键接口**:
```typescript
// 创建快照（写入前自动调用）
SnapshotManager.create(ledgerName, trigger, summary)

// 获取快照列表（按时间倒序）
SnapshotManager.list(ledgerName)

// 读取快照内容
SnapshotManager.read(ledgerName, snapshotId)

// 回退到指定快照
SnapshotManager.rollback(ledgerName, snapshotId)
```

**回退流程**:
1. 先将当前记忆拍一个新快照（rollback 类型）
2. 用选中的历史快照内容覆盖当前记忆文件
3. 更新索引

---

### 3. SelfDescriptionManager (`src/core/services/SelfDescriptionManager.ts`)

用户自述独立管理模块，负责：
- 自述文件读写（`Documents/PixelBill/self_description/user_profile.md`）
- 支持从旧配置的 `userContext` 字段迁移

**关键接口**:
```typescript
// 加载自述文件
SelfDescriptionManager.load()

// 保存自述文件
SelfDescriptionManager.save(content)
```

---

### 4. LearningSession (`src/core/ai_engine/LearningSession.ts`)

LLM 学习会话模块，负责：
- 从实例库中提取模式
- 生成学习系统 Prompt
- 解析 LLM 返回的操作指令（ADD/MODIFY/DELETE）
- 执行增量更新并创建快照

**工作流程**:
```typescript
// 1. 加载当前记忆和实例库
const currentMemory = await MemoryManager.load(ledgerName);
const examples = await ExampleStore.load(ledgerName);

// 2. 构建学习 Prompt
const systemPrompt = buildLearningSystemPrompt();
const userPrompt = buildLearningUserPrompt(currentMemory, examples);

// 3. 调用 LLM 获取操作建议
const operations = await callLLM(systemPrompt, userPrompt);

// 4. 创建快照（备份当前版本）
await SnapshotManager.create(ledgerName, 'ai_learn', summary);

// 5. 应用操作
await MemoryManager.applyOperations(ledgerName, operations);
```

---

### 5. ConfigManager 扩展 (`src/core/config/ConfigManager.ts`)

新增用户上下文兼容接口：
- `getUserContext()` - 优先从新文件读取，降级到旧配置
- `saveUserContext()` - 保存到独立文件，同时清空旧配置字段
- `migrateUserContext()` - 自动迁移旧数据

**迁移逻辑**:
```typescript
async migrateUserContext(): Promise<void> {
  const config = await this.getConfig();
  if (config.userContext && config.userContext.trim()) {
    // 迁移到独立文件
    await SelfDescriptionManager.save(config.userContext);
    // 清空旧字段
    config.userContext = '';
    await this.saveConfig(config);
  }
}
```

---

### 6. PromptBuilder 更新 (`src/core/llm_service/prompt/PromptBuilder.ts`)

现在加载两类记忆注入：
1. **Self-Description**（用户自述）- 通过 `SelfDescriptionManager`
2. **Learned Preferences**（学习记忆）- 通过 `MemoryManager`

```typescript
async buildForClassification(): Promise<LLMContext> {
  // 加载记忆和自述
  const [memories, selfDesc] = await Promise.all([
    MemoryManager.load(ledgerName),
    SelfDescriptionManager.load()
  ]);

  // 注入 Prompt
  return {
    learned_preferences: memories,
    self_description: selfDesc,
    // ...
  };
}
```

---

### 7. SettingsPage UI 更新 (`src/components/mobile/SettingsPage.tsx`)

新增 AI 记忆管理面板：
- **统计卡片**：实例库计数、记忆条目计数
- **立即学习按钮**：触发学习会话
- **学习阈值滑块**：配置触发学习的实例数量阈值（1-20）
- **当前记忆展示**：只读显示当前记忆内容
- **历史版本入口**：快照列表与回退功能

**用户操作流程**:
1. 进入设置页 → 点击 "AI_MEMORY"
2. 查看统计信息（实例库/记忆条目数）
3. 点击 "[LEARN_NOW]" 触发学习
4. 查看学习结果摘要
5. 点击 "[VIEW_HISTORY]" 查看历史版本
6. 选择快照点击 "[ROLLBACK]" 回退

---

## 数据流

### 学习会话完整流程

```
用户点击 "立即学习"
        ↓
LearningSession.start(ledgerName)
        ↓
加载当前记忆 + 实例库
        ↓
构建学习 Prompt（含所有实例）
        ↓
调用 LLM 分析归纳
        ↓
解析返回的 JSON 操作指令
        ↓
SnapshotManager.create('ai_learn')  // 备份
        ↓
MemoryManager.applyOperations()     // 应用更新
        ↓
显示学习结果摘要
```

### Prompt 注入层次（四级优先级）

```
System Prompt
├── Self-Description (用户自述)
│   └── "我是西工大学生，和女朋友一起生活..."
├── Reference Corrections (P0 实例库案例)
│   └── [{ merchant: "肯德基", category: "meal", reason: "..." }]
├── Learned Preferences (P1 记忆文件)
│   └── ["单笔餐饮 > 70元视为大餐，归others", ...]
└── Your own inference (AI 推断)
```

---

## 存储位置

| 文件 | 位置 | 说明 |
|------|------|------|
| `classify_memory/{ledger}.md` | Documents | 记忆文件（有序列表）|
| `self_description/user_profile.md` | Documents | 用户自述文件 |
| `memory_snapshots/{ledger}/` | 沙箱 Data | 快照目录 |
| `memory_snapshots/{ledger}/index.json` | 沙箱 Data | 快照索引 |
| `memory_snapshots/{ledger}/snap_xxx.md` | 沙箱 Data | 快照内容 |

开发模式下查看路径：
```
virtual_android_filesys/Documents_path/PixelBill/classify_memory/default.md
virtual_android_filesys/Documents_path/PixelBill/self_description/user_profile.md
virtual_android_filesys/sandbox_path/memory_snapshots/default/
```

---

## 文件格式

### 记忆文件（classify_memory/{ledger}.md）

```markdown
1. 我是西工大学生，和女朋友一起生活，meal只统计双人用餐
2. 单笔餐饮 > 70元视为大餐/聚餐，归 others
3. 同一餐点时段已有正餐，后续小吃/面包归 others
4. 便利店消费 > 20元 + 晚间无正餐 → meal
```

### 快照索引（index.json）

```json
{
  "snapshots": [
    {
      "id": "snap_001",
      "timestamp": "2026-03-16T10:30:00.000Z",
      "trigger": "ai_learn",
      "summary": "学习会话：新增 2 条，修改 1 条"
    }
  ]
}
```

---

## 测试方法

### 浏览器控制台快速测试

```javascript
// 运行 P1 完整自动化测试
await window.__DEBUG_TOOLS__.runP1Test()

// 记忆文件操作
await window.__DEBUG_TOOLS__.loadMemories()
await window.__DEBUG_TOOLS__.saveMemories(['记忆1', '记忆2'])
await window.__DEBUG_TOOLS__.addMemory('新记忆')
await window.__DEBUG_TOOLS__.modifyMemory(1, '修改后')
await window.__DEBUG_TOOLS__.deleteMemory(1)

// 快照操作
await window.__DEBUG_TOOLS__.listSnapshots()
await window.__DEBUG_TOOLS__.createSnapshot('测试快照')
await window.__DEBUG_TOOLS__.readSnapshot('snap_001')
await window.__DEBUG_TOOLS__.rollbackSnapshot('snap_001')

// 自述文件
await window.__DEBUG_TOOLS__.loadSelfDesc()
await window.__DEBUG_TOOLS__.saveSelfDesc('我是西工大学生...')
await window.__DEBUG_TOOLS__.getUserContext()

// 清理数据
await window.__DEBUG_TOOLS__.clearP1Data()
```

### UI 集成测试

详见 `docs/P1_TEST_GUIDE.md`

1. **设置页入口测试** - 验证 AI_MEMORY 选项可进入
2. **立即学习测试** - 触发学习并验证结果
3. **历史版本回退测试** - 创建快照并回退
4. **阈值配置测试** - 滑块调整阈值
5. **Prompt 注入验证** - 检查请求体包含记忆内容

---

## 与设计的差异

| 设计文档 | 实际实现 | 原因 |
|----------|----------|------|
| 预估 2-3 天 | 实际 1 天完成 | P0 架构复用，代码结构清晰 |
| 学习阈值配置 | 已实现 UI，持久化待后续 | MVP 优先功能可用 |
| 压缩功能 | 未实现 | 学习会话已能控制条目数量，压缩非必需 |

---

## 下一步工作（P2 及以后）

可选的未来增强：

1. **主动学习** - AI 主动询问不确定的分类
2. **跨账本学习** - 账本间记忆共享/迁移
3. **学习报告** - 可视化展示 AI 学习成果
4. **规则引擎联动** - 高置信度记忆自动生成正则规则

详见设计文档：`AI_SELF_LEARNING_DESIGN_v5.md`

---

## Bug 修复记录

### 2026-03-17 修复

| 问题 | 修复内容 |
|------|----------|
| 第一个快照不显示 active | `LearningSession` 返回 `snapshotId`，UI 直接设置为当前 |
| 第一个快照无法删除 | 删除按钮不再禁用任何快照，包括当前活跃的 |
| 删除当前快照后状态混乱 | 删除后重新查找匹配，允许回到"无快照"状态 |
| 删除当前快照确认提示 | 添加额外提示："删除后当前记忆将不再与任何快照关联" |
| **快照 ID 重复问题** | 使用最大序号+1生成 ID，避免删除后 ID 冲突 |
| **除以零风险** | `ExampleStore.calculateMatchScore` 添加 `maxAmount > 0` 检查 |
| **修正判断逻辑优化** | 使用 `newCategory` 变量，避免重复读取 `patch.updates.user_category` |
| **锁定确认条件改进** | 改为 `!hasUserCategoryUpdate`，避免同时修改分类和锁定时重复写入 |
| **回退后显示错误** | 直接设置 `currentSnapshotId` 为回退目标，而非依赖查找匹配 |

---

## 测试指南

- `docs/P1_TEST_GUIDE.md` - 详细测试步骤
- `docs/P0_TEST_GUIDE.md` - P0 相关测试（实例库）
- `docs/P0_IMPLEMENTATION_SUMMARY.md` - P0 实现总结
