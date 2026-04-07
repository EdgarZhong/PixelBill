# v6 快照系统迁移指南

## 概述

v6 版本对 AI 自学习系统的快照机制进行了重大架构升级，实现了"单一事实源"（Single Source of Truth）设计。

**升级日期**：2026-04-07  
**影响范围**：SnapshotManager、MemoryManager、LedgerManager、LearningSession

---

## 核心变更

### 1. 架构变更

#### v5 架构（双轨制）
```
Documents/PixelBill/classify_memory/
├── default.md                    # 当前记忆文件
├── travel.md
└── ...

Data/memory_snapshots/
├── default/
│   ├── index.json
│   ├── snap_001.md              # 历史快照
│   ├── snap_002.md
│   └── ...
└── travel/
    └── ...
```

**问题**：
- 当前记忆和快照分离，存在两个事实来源
- 回退操作需要创建新快照，时间线混乱
- 快照命名使用序号，删除后可能重复

#### v6 架构（单一事实源）
```
Documents/PixelBill/classify_memory/
├── default/
│   ├── index.json                          # 快照索引 + current_snapshot_id
│   ├── 2026-03-17_14-30-00-000.md         # 快照文件
│   ├── 2026-03-17_15-10-00-000.md         # ← current_snapshot_id 指向此文件
│   └── ...
└── travel/
    └── ...
```

**优势**：
- 当前记忆始终通过 `current_snapshot_id` 获取，单一事实源
- 回退操作只更新指针，不创建新快照，时间线清晰
- 快照使用时间戳命名，永不重复
- 所有快照文件统一存储在 Documents 目录

### 2. index.json 结构变更

#### v5 格式
```json
{
  "snapshots": [
    {
      "id": "snap_001",
      "timestamp": "2026-03-17T14:30:00.000Z",
      "trigger": "user_edit",
      "summary": "用户手动编辑"
    }
  ]
}
```

#### v6 格式
```json
{
  "current_snapshot_id": "2026-03-17_15-10-00-000",
  "snapshots": [
    {
      "id": "2026-03-17_14-30-00-000",
      "timestamp": "2026-03-17T14:30:00.000Z",
      "trigger": "user_edit",
      "summary": "用户手动编辑"
    },
    {
      "id": "2026-03-17_15-10-00-000",
      "timestamp": "2026-03-17T15:10:00.000Z",
      "trigger": "ai_learn",
      "summary": "学习会话：基于 5 条修正记录"
    }
  ]
}
```

**新增字段**：
- `current_snapshot_id`：指向当前版本的快照 ID

### 3. 快照命名规则

| 版本 | 命名格式 | 示例 | 说明 |
|------|----------|------|------|
| v5 | `snap_{序号}` | `snap_001` | 序号递增，删除后可能重复 |
| v6 | `YYYY-MM-DD_HH-mm-ss-SSS` | `2026-03-17_14-30-00-000` | 时间戳，永不重复 |

### 4. trigger 类型扩展

v6 新增两个 trigger 类型：

| trigger | 说明 | 使用场景 |
|---------|------|----------|
| `ledger_init` | 账本初始化 | 创建新账本时生成空快照 |
| `migration` | 数据迁移 | v5 → v6 迁移时使用 |

完整 trigger 列表：
- `ledger_init` - 账本初始化
- `ai_learn` - 学习会话完成
- `ai_compress` - 收编完成
- `user_edit` - 用户手动编辑
- `tag_delete` - 标签删除导致追加
- `manual` - 手动创建测试快照
- `migration` - 数据迁移

---

## API 变更

### SnapshotManager

#### 1. `create()` 方法

**v5 签名**：
```typescript
public static async create(
  ledgerName: string,
  trigger: SnapshotTrigger,
  summary: string
): Promise<string>
```

**v6 签名**：
```typescript
public static async create(
  ledgerName: string,
  content: string,              // 新增：快照内容
  trigger: SnapshotTrigger,
  summary: string
): Promise<string>
```

**变更说明**：
- 不再依赖 `MemoryManager.load()` 读取当前记忆
- 接受 `content` 参数，由调用方提供快照内容
- 自动更新 `current_snapshot_id` 指针
- 执行 GC：删除"最旧的非当前快照"

#### 2. `rollback()` 方法

**v5 签名**：
```typescript
public static async rollback(
  ledgerName: string,
  snapshotId: string
): Promise<boolean>
```

**v6 签名**：
```typescript
public static async rollback(
  ledgerName: string,
  snapshotId: string
): Promise<string | null>  // 返回快照内容
```

**变更说明**：
- 只更新 `current_snapshot_id` 指针，不创建新快照
- 返回快照内容（供调用方写入记忆文件）
- 不再调用 `MemoryManager.save()`（避免循环依赖）

#### 3. 新增方法

```typescript
// 获取当前快照 ID
public static async getCurrentId(ledgerName: string): Promise<string>

// 删除指定快照（v6 新增）
public static async delete(ledgerName: string, snapshotId: string): Promise<boolean>
```

**delete() 方法说明**：
- 规则：不能删除 `current_snapshot_id` 指向的快照
- 删除快照文件和索引中的元数据
- 返回 `true` 表示删除成功，`false` 表示失败（当前快照或不存在）

#### 4. 废弃方法

```typescript
// v6 废弃：使用 getCurrentId() 替代
public static async getLatestId(ledgerName: string): Promise<string>

// v6 废弃：使用 getCurrentId() 替代
public static async findMatchingSnapshot(ledgerName: string): Promise<string | null>

// v6 废弃：单一事实源下不需要验证
public static async verifyMatch(ledgerName: string, snapshotId: string): Promise<boolean>
```

### MemoryManager

#### 1. `load()` 方法

**v5 实现**：
```typescript
// 直接读取 Documents/PixelBill/classify_memory/{ledger}.md
const result = await Filesystem.readFile({
  path: `PixelBill/classify_memory/${ledgerName}.md`,
  directory: Directory.Documents
});
```

**v6 实现**：
```typescript
// 通过 current_snapshot_id 读取快照
const currentId = await SnapshotManager.getCurrentId(ledgerName);
const snapshot = await SnapshotManager.read(ledgerName, currentId);
return snapshot.content;
```

#### 2. `save()` 方法

**v5 签名**：
```typescript
public static async save(
  ledgerName: string,
  memories: string[]
): Promise<void>
```

**v6 签名**：
```typescript
public static async save(
  ledgerName: string,
  memories: string[],
  trigger?: SnapshotTrigger,     // 新增：触发类型
  summary?: string               // 新增：快照摘要
): Promise<void>
```

**变更说明**：
- 不再直接写入记忆文件
- 创建新快照并更新 `current_snapshot_id`
- 自动触发 GC

#### 3. `applyOperations()` 方法

**v5 签名**：
```typescript
public static async applyOperations(
  ledgerName: string,
  operations: MemoryOperation[]
): Promise<MemoryOperationResult>
```

**v6 签名**：
```typescript
public static async applyOperations(
  ledgerName: string,
  operations: MemoryOperation[],
  trigger?: SnapshotTrigger,     // 新增
  summary?: string               // 新增
): Promise<MemoryOperationResult>
```

#### 4. 单条操作方法

所有单条操作方法（`add`、`modify`、`delete`、`clear`）均新增 `trigger` 参数：

```typescript
public static async add(
  ledgerName: string,
  content: string,
  trigger?: SnapshotTrigger      // 新增
): Promise<void>
```

#### 5. 新增方法

```typescript
// 回退到指定快照（便捷方法）
public static async rollbackToSnapshot(
  ledgerName: string,
  snapshotId: string
): Promise<boolean>
```

### LedgerManager

#### 1. `createLedger()` 方法

**v6 新增逻辑**：
```typescript
// 创建账本后自动生成空快照
await this.initializeLedgerSnapshot(sanitizedName);
```

#### 2. `deleteLedgerAIFiles()` 方法

**v5 清理路径**：
- `Documents/PixelBill/classify_memory/{ledger}.md`
- `Data/memory_snapshots/{ledger}/`

**v6 清理路径**：
- `Documents/PixelBill/classify_memory/{ledger}/`（整个目录）
- `Documents/PixelBill/self_description/user_profile.md`

#### 3. `renameLedgerAIFiles()` 方法

**v5 迁移路径**：
- `classify_memory/{old}.md` → `classify_memory/{new}.md`
- `memory_snapshots/{old}/` → `memory_snapshots/{new}/`

**v6 迁移路径**：
- `classify_memory/{old}/` → `classify_memory/{new}/`（整个目录）

### LearningSession

#### `run()` 方法

**v5 实现**：
```typescript
// 执行操作
await MemoryManager.applyOperations(ledgerName, operations);

// 手动创建快照
const snapshotId = await SnapshotManager.create(
  ledgerName,
  'ai_learn',
  `学习后快照：基于 ${examples.length} 条修正记录`
);
```

**v6 实现**：
```typescript
// 执行操作（自动创建快照）
await MemoryManager.applyOperations(
  ledgerName,
  operations,
  'ai_learn',
  `学习会话：基于 ${examples.length} 条修正记录`
);

// 获取当前快照 ID
const snapshotId = await SnapshotManager.getCurrentId(ledgerName);
```

---

## 数据迁移

### 自动迁移

v6 提供了 `MigrationManager` 自动迁移工具：

```typescript
import { MigrationManager } from './core/services/MigrationManager';

// 检查是否需要迁移
const needsMigration = await MigrationManager.needsMigration('default');

// 执行迁移
const success = await MigrationManager.migrate('default');

// 批量迁移所有账本
const result = await MigrationManager.migrateAll(['default', 'travel']);
// result: { total: 2, migrated: 2, skipped: 0, failed: 0 }
```

### 迁移流程

1. **检测 v5 数据**：查找 `Documents/PixelBill/classify_memory/{ledger}.md`
2. **读取 v5 记忆文件**：解析内容为 `string[]`
3. **创建初始快照**：使用 `migration` trigger
4. **迁移 v5 快照目录**：
   - 读取 `Data/memory_snapshots/{ledger}/index.json`
   - 逐个迁移快照文件到 v6 格式
   - 转换 trigger 类型
5. **删除 v5 数据**：
   - 删除 `{ledger}.md`
   - 删除 `memory_snapshots/{ledger}/`

### 手动迁移

如果自动迁移失败，可以手动执行：

```bash
# 1. 备份 v5 数据
cp -r "Documents/PixelBill/classify_memory" "backup_v5_memory"
cp -r "Data/memory_snapshots" "backup_v5_snapshots"

# 2. 在浏览器控制台执行
await window.__DEBUG_TOOLS__.migrateToV6('default')

# 3. 验证迁移结果
await window.__DEBUG_TOOLS__.listSnapshots('default')
await window.__DEBUG_TOOLS__.getCurrentSnapshot('default')
```

---

## 调试工具更新

### 新增命令

```javascript
// 获取当前快照 ID
await window.__DEBUG_TOOLS__.getCurrentSnapshot('default')

// 输出：
// [SnapshotManager] 当前快照: 2026-03-17_15-10-00-000
//   触发: ai_learn
//   摘要: 学习会话：基于 5 条修正记录
//   时间: 2026/3/17 15:10:00
//   内容: 4 条记忆

// 删除指定快照（v6 新增）
await window.__DEBUG_TOOLS__.deleteSnapshot('2026-03-17_14-30-00-000')
// 输出：[SnapshotManager] 已删除快照 2026-03-17_14-30-00-000
```

### 更新命令

```javascript
// listSnapshots - 显示当前快照标记
await window.__DEBUG_TOOLS__.listSnapshots('default')
// 输出表格中 current 列显示 ✓

// createSnapshot - 适配 v6 API
await window.__DEBUG_TOOLS__.createSnapshot('测试快照')

// rollbackSnapshot - 显示回退后记忆
await window.__DEBUG_TOOLS__.rollbackSnapshot('2026-03-17_14-30-00-000')

// deleteSnapshot - 禁止删除当前快照
await window.__DEBUG_TOOLS__.deleteSnapshot('2026-03-17_15-10-00-000')
// 输出：[SnapshotManager] 无法删除当前快照

// runP1Test - v6 测试流程
await window.__DEBUG_TOOLS__.runP1Test()
```

### 废弃命令

```javascript
// findCurrentSnapshot - 使用 getCurrentSnapshot 替代
await window.__DEBUG_TOOLS__.findCurrentSnapshot()
// 输出警告：findCurrentSnapshot() 已废弃
```

---

## 兼容性说明

### 向后兼容

- v6 代码可以读取 v5 数据（通过 `MigrationManager`）
- 迁移后 v5 数据会被删除，无法回退到 v5

### 破坏性变更

1. **API 签名变更**：
   - `SnapshotManager.create()` 新增 `content` 参数
   - `SnapshotManager.rollback()` 返回类型变更
   - `MemoryManager.save()` 新增可选参数

2. **存储路径变更**：
   - 快照目录从 `Data/memory_snapshots/` 迁移到 `Documents/PixelBill/classify_memory/`
   - 当前记忆文件 `{ledger}.md` 不再存在

3. **废弃方法**：
   - `SnapshotManager.getLatestId()`
   - `SnapshotManager.findMatchingSnapshot()`
   - `SnapshotManager.verifyMatch()`

---

## 测试验证

### 单元测试

```javascript
// 1. 测试快照创建
await window.__DEBUG_TOOLS__.runP1Test()

// 2. 测试回退操作
const snapshots = await window.__DEBUG_TOOLS__.listSnapshots()
await window.__DEBUG_TOOLS__.rollbackSnapshot(snapshots.snapshots[1].id)

// 3. 验证当前快照
const currentId = await window.__DEBUG_TOOLS__.getCurrentSnapshot()
console.assert(currentId === snapshots.snapshots[1].id)

// 4. 测试 GC
for (let i = 0; i < 35; i++) {
  await window.__DEBUG_TOOLS__.createSnapshot(`测试快照 ${i}`)
}
const afterGC = await window.__DEBUG_TOOLS__.listSnapshots()
console.assert(afterGC.snapshots.length <= 30)
```

### 集成测试

1. **创建账本测试**：
   ```javascript
   const manager = LedgerManager.getInstance()
   await manager.createLedger('test_v6')
   const currentId = await SnapshotManager.getCurrentId('test_v6')
   console.assert(currentId !== '', '新账本应有初始快照')
   ```

2. **学习会话测试**：
   ```javascript
   const result = await LearningSession.run('default', categories)
   console.assert(result.snapshotId !== undefined, '学习后应有快照')
   ```

3. **迁移测试**：
   ```javascript
   const result = await MigrationManager.migrateAll(['default'])
   console.assert(result.migrated > 0, '应成功迁移至少一个账本')
   ```

---

## 常见问题

### Q1: 迁移后如何回退到 v5？

**A**: v6 迁移是单向的，无法自动回退。如需回退：
1. 恢复 v5 数据备份
2. 回退代码到 v5 版本
3. 重新部署应用

建议在迁移前做好完整备份。

### Q2: 为什么回退操作不创建新快照？

**A**: v6 采用"单一事实源"设计，回退只是切换 `current_snapshot_id` 指针。所有历史版本都已保存为快照，无需创建新快照。如果回退后又想回到回退前的状态，直接切换回原来的快照即可。

### Q3: GC 会删除当前快照吗？

**A**: 不会。GC 规则是"删除最旧的非当前快照"，`current_snapshot_id` 指向的快照永远不会被删除。

### Q4: 快照数量超过 30 个怎么办？

**A**: 每次创建新快照时会自动触发 GC，删除最旧的非当前快照，保持总数不超过 30 个。

### Q5: 如何手动清理所有快照？

**A**: 
```javascript
await SnapshotManager.clearAll('default')
```
注意：这会删除整个快照目录，包括当前快照。谨慎使用。

---

## 参考文档

- [AI_SELF_LEARNING_DESIGN_v6.md](../AI_SELF_LEARNING_DESIGN_v6.md) - v6 完整设计文档
- [SnapshotManager.ts](../src/core/services/SnapshotManager.ts) - v6 实现代码
- [MigrationManager.ts](../src/core/services/MigrationManager.ts) - 迁移工具代码

---

**文档版本**：v1.0  
**最后更新**：2026-04-07  
**维护者**：PixelBill 开发团队
