# P0: 实例库自动采集 + 注入 测试指南

## 测试环境

确保开发服务器正在运行：
```bash
npm run dev
```

浏览器访问 http://localhost:5173/，打开 DevTools 控制台进行测试。

---

## 快速测试（浏览器控制台）

### 1. 运行自动化测试脚本

```javascript
// 运行完整的 P0 测试流程
await window.__DEBUG_TOOLS__.runP0Test()
```

预期输出：
- 显示初始实例数
- 添加测试实例
- 验证写入成功
- 测试检索功能
- 清理测试数据

### 2. 手动测试各功能

#### 查看当前实例库
```javascript
await window.__DEBUG_TOOLS__.listExamples()
```

#### 添加测试数据
```javascript
await window.__DEBUG_TOOLS__.addTestExample()
```

#### 测试检索算法
```javascript
await window.__DEBUG_TOOLS__.testRetrieval()
```

#### 查看统计信息
```javascript
await ExampleStore.getStats('default')
```

#### 清空实例库（谨慎）
```javascript
await window.__DEBUG_TOOLS__.clearExamples()
```

---

## 集成测试（完整流程）

### 测试场景 1：用户修正分类触发实例库写入

1. **准备工作**
   - 确保有导入的交易数据
   - 确保已有 AI 分类结果（或手动设置）

2. **步骤**
   ```javascript
   // 1. 查看当前实例数
   await ExampleStore.getStats('default')

   // 2. 在 UI 中修改某条交易的分类
   // （选择一条 AI 已分类的交易，改为不同分类）

   // 3. 检查实例库是否自动写入
   await window.__DEBUG_TOOLS__.listExamples()
   ```

3. **预期结果**
   - 实例库新增一条记录
   - `isCorrection` 为 true（因为是修正 AI 的错误）
   - 不包含 `ai_reason` 字段

### 测试场景 2：用户锁定确认触发实例库写入

1. **步骤**
   ```javascript
   // 1. 查看当前实例数
   await ExampleStore.getStats('default')

   // 2. 在 UI 中锁定一条 AI 分类正确的交易
   // （点击锁定按钮）

   // 3. 检查实例库是否自动写入
   await window.__DEBUG_TOOLS__.listExamples()
   ```

2. **预期结果**
   - 实例库新增一条记录
   - `isCorrection` 为 false（AI 分对）
   - 包含 `ai_reason` 字段

### 测试场景 3：分类时实例库注入 Prompt

1. **步骤**
   ```javascript
   // 1. 先添加一些实例库数据
   await window.__DEBUG_TOOLS__.addTestExample()

   // 2. 触发 AI 分类（如果有未分类数据）
   // 或查看 PromptBuilder 的日志输出

   // 3. 检查网络请求的 Payload
   // 在 Network 面板中查看发送到 LLM 的请求
   ```

2. **预期结果**
   - Prompt 的 `context.reference_corrections` 字段包含相关案例
   - 相似交易的分类结果受案例影响

---

## 文件位置验证

在开发模式下（浏览器环境），实例库文件存储在：
```
virtual_android_filesys/sandbox_path/classify_examples/
├── default.json
```

可以直接查看该文件验证写入是否成功。

---

## 常见问题排查

### 问题 1：实例库没有自动写入

**检查点：**
1. Arbiter 的回调是否注册成功
   ```javascript
   // 在控制台检查
   globalArbiter.onExampleStoreWrite
   ```

2. LedgerService 是否正确设置了回调
   - 查看控制台是否有 `[LedgerService] Example store updated` 日志

### 问题 2：检索结果为空

**检查点：**
1. 实例库是否有数据
   ```javascript
   await ExampleStore.load('default')
   ```

2. 检索条件是否匹配
   - 商户名是否相似
   - 金额是否在 ±50% 范围内
   - 时间是否在同一餐点时段

### 问题 3：Prompt 中没有 reference_corrections

**检查点：**
1. 确认 PromptBuilder 正确调用了 ExampleStore
2. 查看控制台是否有 `[ExampleStore] Retrieved X unique examples` 日志

---

## 单元测试（可选）

如需编写正式的单元测试，可创建 `src/core/services/__tests__/ExampleStore.test.ts`：

```typescript
import { ExampleStore } from '../ExampleStore';

describe('ExampleStore', () => {
  const TEST_LEDGER = 'test_ledger';

  beforeEach(async () => {
    await ExampleStore.clear(TEST_LEDGER);
  });

  test('should add and retrieve examples', async () => {
    const record = {
      id: 'tx1',
      counterparty: '测试商户',
      // ... other fields
    };

    await ExampleStore.addOrUpdate(TEST_LEDGER, record, false);
    const stats = await ExampleStore.getStats(TEST_LEDGER);

    expect(stats.count).toBe(1);
  });

  // ... more tests
});
```

---

## 测试 checklist

- [ ] `runP0Test()` 自动化测试通过
- [ ] 用户修正分类时实例库自动写入
- [ ] 用户锁定确认时实例库自动写入
- [ ] 实例库正确区分 `ai_reason` 和 `user_reason`
- [ ] 分类时 Prompt 包含 `reference_corrections`
- [ ] 检索算法能匹配相似交易
- [ ] 文件正确存储在沙箱目录

---

**测试完成标志：**
1. 所有控制台命令执行无错误
2. 实例库文件正确生成
3. Prompt 中包含 reference_corrections
4. UI 操作（修正/锁定）触发实例库更新
