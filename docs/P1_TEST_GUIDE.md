# P1: 记忆文件 + 学习会话 测试指南

**测试日期**: 2026-03-16
**状态**: 🚧 待测试

---

## 测试环境

确保开发服务器正在运行：
```bash
npm run dev
```

浏览器访问 http://localhost:5173/

---

## 快速自动化测试

在浏览器控制台执行：

```javascript
// 运行 P1 完整测试
await window.__DEBUG_TOOLS__.runP1Test()
```

预期输出：
```
🧪 开始 P1 记忆文件测试...
[Step 1] 测试记忆文件读写
  ✓ 写入 3 条记忆
  ✓ 读取验证成功
[Step 2] 测试增量更新
  ✓ ADD 操作成功
  ✓ MODIFY 操作成功
  ✓ DELETE 操作成功
[Step 3] 测试快照功能
  ✓ 创建快照成功
  ✓ 读取快照成功
[Step 4] 测试自述文件
  ✓ 保存自述成功
  ✓ 读取自述成功
[Step 5] 测试 ConfigManager 兼容接口
  ✓ getUserContext 成功
✅ P1 测试完成!
```

**清理测试数据**：
```javascript
await window.__DEBUG_TOOLS__.clearP1Data()
```

---

## 手动测试步骤

### 1. 记忆文件基础测试

**使用 Debug 工具（推荐）**：
```javascript
// 查看当前记忆
await window.__DEBUG_TOOLS__.loadMemories()

// 保存记忆（覆盖）
await window.__DEBUG_TOOLS__.saveMemories([
  '我是西工大学生，meal只统计双人用餐',
  '单笔餐饮 > 70元视为大餐，归others',
  '便利店消费 > 20元 + 晚间无正餐 → meal'
])

// 添加单条
await window.__DEBUG_TOOLS__.addMemory('益禾堂：奶茶饮品，归others')

// 修改单条（第2条）
await window.__DEBUG_TOOLS__.modifyMemory(2, '单笔餐饮 > 80元视为大餐（已调整）')

// 删除单条（第3条）
await window.__DEBUG_TOOLS__.deleteMemory(3)
```

**或手动导入模块**：
```javascript
// 加载 MemoryManager
const { MemoryManager } = await import('/src/core/services/MemoryManager.ts')

// 测试写入
await MemoryManager.save('default', [
  '我是西工大学生，meal只统计双人用餐',
  '单笔餐饮 > 70元视为大餐，归others',
  '便利店消费 > 20元 + 晚间无正餐 → meal'
])

// 测试读取
const memories = await MemoryManager.load('default')
console.log('记忆内容:', memories)

// 测试单条添加
await MemoryManager.add('default', '益禾堂：奶茶饮品，归others')

// 测试修改
await MemoryManager.modify('default', 2, '单笔餐饮 > 80元视为大餐（已调整）')

// 测试删除
await MemoryManager.delete('default', 3)

// 查看最终内容
await MemoryManager.load('default')
```

### 2. 快照功能测试

**使用 Debug 工具（推荐）**：
```javascript
// 创建快照
await window.__DEBUG_TOOLS__.createSnapshot('手动测试快照')

// 列出所有快照
await window.__DEBUG_TOOLS__.listSnapshots()

// 读取特定快照内容
await window.__DEBUG_TOOLS__.readSnapshot('snap_001')

// 回退到指定快照
await window.__DEBUG_TOOLS__.rollbackSnapshot('snap_001')
```

**或手动导入模块**：
```javascript
const { SnapshotManager } = await import('/src/core/services/SnapshotManager.ts')

// 创建快照
await SnapshotManager.create('default', 'manual', '手动测试快照')

// 列出快照
const snaps = await SnapshotManager.list('default')
console.table(snaps)

// 读取快照内容
const content = await SnapshotManager.read('default', snaps[0]?.id)
console.log(content)
```

### 3. 自述文件测试

**使用 Debug 工具（推荐）**：
```javascript
// 保存自述
await window.__DEBUG_TOOLS__.saveSelfDesc('我是西工大学生，和女朋友一起生活，meal只统计双人用餐')

// 读取自述
await window.__DEBUG_TOOLS__.loadSelfDesc()

// 通过 ConfigManager 读取（兼容旧配置）
await window.__DEBUG_TOOLS__.getUserContext()
```

**或手动导入模块**：
```javascript
const { SelfDescriptionManager } = await import('/src/core/services/SelfDescriptionManager.ts')

// 保存自述
await SelfDescriptionManager.save('我是西工大学生，和女朋友一起生活，meal只统计双人用餐')

// 读取自述
const desc = await SelfDescriptionManager.load()
console.log('自述内容:', desc)

// 通过 ConfigManager 读取（兼容旧配置）
const ctx = await configManager.getUserContext()
console.log('getUserContext:', ctx)
```

---

## UI 集成测试

### 测试场景 1：设置页 AI 记忆入口

1. 打开应用，下拉显示设置图标
2. 点击进入设置页
3. **验证**: 账本设置区有 "AI_MEMORY" 选项
4. 点击 "AI_MEMORY"
5. **验证**: 进入 AI 记忆面板，显示：
   - 修正记录计数
   - 学习条目计数
   - 立即学习按钮
   - 学习阈值滑块
   - 当前记忆内容

### 测试场景 2：立即学习按钮

**前置条件**: 实例库有修正记录

1. 在 AI 记忆面板点击 "[LEARN_NOW]"
2. **验证**: 按钮变为 "[LEARNING...]"
3. 等待 LLM 响应（需要配置 API Key）
4. **验证**: 显示学习结果摘要（如 "新增 2 条，修改 1 条"）
5. **验证**: 当前记忆内容区域更新

### 测试场景 3：历史版本回退

1. 在 AI 记忆面板点击 "[VIEW_HISTORY]"
2. **验证**: 显示历史快照列表
3. 点击某个快照的 "[ROLLBACK]"
4. 确认回退
5. **验证**: 当前记忆内容回退到该版本
6. **验证**: 新增一条 rollback 类型的快照

### 测试场景 4：学习阈值配置

1. 在 AI 记忆面板找到阈值滑块
2. 拖动滑块修改阈值（1-20）
3. **验证**: 数值实时更新
4. （后续实现：阈值持久化存储）

---

## Prompt 注入验证

### 验证记忆注入

1. 确保记忆文件有内容：
```javascript
await MemoryManager.save('default', ['测试记忆：所有星巴克归meal'])
```

2. 触发 AI 分类（如果有未分类交易）

3. 在 Network 面板查看请求体
4. **验证**: System Prompt 包含 "Learned Preferences" 段
5. **验证**: 记忆内容出现在 System Prompt 中

---

## 文件位置验证

开发模式下查看以下路径：

```
# 记忆文件
virtual_android_filesys/Documents_path/PixelBill/classify_memory/default.md

# 快照
virtual_android_filesys/sandbox_path/memory_snapshots/default/
├── index.json
└── snap_001.md

# 自述文件
virtual_android_filesys/Documents_path/PixelBill/self_description/user_profile.md
```

---

## 常见问题排查

### 问题 1：学习按钮不可点击

**检查**: 实例库是否有修正记录
```javascript
await ExampleStore.getStats('default')
```

### 问题 2：学习失败

**检查**:
1. API Key 是否配置
2. 控制台查看 LLM 响应错误

### 问题 3：记忆内容不显示

**检查**: 记忆文件是否存在
```javascript
await MemoryManager.exists('default')
```

### 问题 4：自述文件未迁移

**检查**: 旧配置中的 userContext 是否已清空
```javascript
(await configManager.getConfig()).userContext
```

---

## 测试 Checklist

- [ ] `runP1Test()` 自动化测试通过
- [ ] 记忆文件读写正常
- [ ] 增量更新（ADD/MODIFY/DELETE）正确执行
- [ ] 快照创建成功
- [ ] 快照回退功能正常
- [ ] 自述文件读写正常
- [ ] 设置页 AI 记忆入口可进入
- [ ] 立即学习按钮触发学习会话
- [ ] 学习结果正确更新记忆文件
- [ ] 历史版本列表显示正确
- [ ] 回退功能正常工作
- [ ] Prompt 正确注入记忆内容

---

**测试完成标志**: 所有 checklist 项目通过，文件正确生成。
