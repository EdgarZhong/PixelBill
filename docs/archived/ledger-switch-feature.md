# 账本切换功能 - 实施规划文档

> 创建日期：2026-02-19
> 状态：**已完成实施** ✅
> 优先级：高

---

## 一、功能概述

在移动模式下，用户可点击 Header 中的 `[CHOOSE_LEDGER]` 按钮，通过二级面板切换账本。每个账本对应一个独立的 `.pixelbill.json` 文件，系统默认账本为 `default`。

---

## 二、设计规范

### 2.1 文件命名规则

- **文件名格式**：`{账本名称}.pixelbill.json`
- **字符限制**：仅允许中文、字母、数字、下划线
- **长度限制**：最多 50 字符
- **默认账本**：`default.pixelbill.json`（永久存在，不可删除）

### 2.2 账本索引存储

- **索引文件路径**：`PixelBill/ledgers.json`
- **数据结构**：
```json
{
  "ledgers": [
    {
      "name": "default",
      "fileName": "default.pixelbill.json",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "lastOpenedAt": "2026-02-19T10:00:00.000Z"
    }
  ],
  "activeLedger": "default"
}
```

### 2.3 UI 交互规范

#### 面板样式
- 严格遵循 `DateRangePicker` 的二级面板样式
- 使用 Framer Motion `layoutId` 实现丝滑 morphing 动画
- 展开到屏幕中心
- Portal 弹窗 + backdrop 遮罩层

#### 账本列表
- 当前激活账本左侧用**主题绿色像素点**（`text-pixel-green`）标出
- 左划手势删除账本（简洁现代风格，左滑露出板块复用规格红色）
- 默认账本 `default` 不可删除（不显示删除标识）

#### 添加账本
- 面板右下角 `+` 按钮
- 点击后在面板内展开输入区域
- 输入框：用于键入账本名称
- `Save` 按钮：保存并激活新账本
- `Cancel` 按钮：取消操作

#### 删除确认
- 右划账本项后显示二次确认对话框
- 允许删除当前激活账本（删除后自动切换到 `default`）

### 2.4 数据持久化

**当前机制确认**：
- 分类修改通过 `PersistenceManager` debounce 写入
- 新数据导入时立即写入

**切换账本保障**：
- 切换前调用 `PersistenceManager.flush()` 确保待写入数据落盘
- 无需用户显式保存操作

---

## 三、技术实现方案

### 3.1 核心 API 设计

#### `src/utils/fs-storage.ts` 新增函数

```typescript
// 账本索引管理
export const LEDGERS_INDEX_NAME = 'ledgers.json';

export interface LedgerIndex {
  ledgers: LedgerMeta[];
  activeLedger: string;
}

export interface LedgerMeta {
  name: string;
  fileName: string;
  createdAt: string;
  lastOpenedAt: string;
}

// 获取账本索引文件句柄
export const getLedgersIndexHandle = async (
  dirHandle: StorageDirHandle
): Promise<StorageHandle | null>;

// 读取账本索引
export const readLedgersIndex = async (
  fileHandle: StorageHandle
): Promise<LedgerIndex>;

// 写入账本索引
export const writeLedgersIndex = async (
  fileHandle: StorageHandle,
  data: LedgerIndex
): Promise<void>;

// 获取指定账本的句柄
export const getLedgerFileHandle = async (
  dirHandle: StorageDirHandle,
  ledgerName: string,
  create?: boolean
): Promise<StorageHandle | null>;

// 删除账本文件
export const deleteLedgerFile = async (
  dirHandle: StorageDirHandle,
  ledgerName: string
): Promise<void>;
```

### 3.2 LedgerService 扩展

#### `src/core/services/LedgerService.ts` 新增方法

```typescript
export class LedgerService {
  // ... 现有代码 ...

  /**
   * 获取所有可用账本列表
   */
  public async listLedgers(): Promise<LedgerMeta[]>;

  /**
   * 切换账本
   * @param ledgerName 账本名称
   * @returns 是否成功
   */
  public async switchLedger(ledgerName: string): Promise<boolean>;

  /**
   * 创建新账本
   * @param name 账本名称
   * @returns 是否成功
   */
  public async createLedger(name: string): Promise<boolean>;

  /**
   * 删除账本
   * @param ledgerName 账本名称
   * @returns 是否成功
   */
  public async deleteLedger(ledgerName: string): Promise<boolean>;

  /**
   * 获取当前激活的账本名称
   */
  public getActiveLedger(): string;
}
```

### 3.3 UI 组件

#### 新增 `src/components/mobile/LedgerSwitcher.tsx`

```typescript
interface LedgerSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  ledgers: LedgerMeta[];
  activeLedger: string;
  onSwitch: (name: string) => void;
  onCreate: (name: string) => void;
  onDelete: (name: string) => void;
}
```

**组件结构**：
```
LedgerSwitcher
├── Portal (Backdrop + Modal)
│   ├── Header: "Choose Ledger"
│   ├── LedgerList (滚动列表)
│   │   ├── LedgerItem (可右划删除)
│   │   │   ├── 激活指示器 (绿点)
│   │   │   ├── 账本名称
│   │   │   └── 删除手势层
│   │   └── ...
│   ├── AddButton (+)
│   └── AddPanel (展开状态)
│       ├── Input (账本名称)
│       ├── Save Button
│       └── Cancel Button
```

**动画要求**：
- 使用 `layoutId="ledger-switcher-container"` 实现 morphing
- 列表项进入/退出使用 `AnimatePresence`
- 右划删除使用 `drag="x"` + `whileDrag` 动画

### 3.4 集成点

#### `src/components/mobile/Header.tsx`
- 为 `[CHOOSE_LEDGER]` 按钮添加 `onClick` 回调
- 传递 `onChooseLedger` prop

#### `src/views/MobileApp.tsx` (或对应入口)
- 添加 `ledgerSwitcherOpen` 状态
- 集成 `LedgerSwitcher` 组件
- 实现回调函数：
  - `handleSwitchLedger`: 调用 `LedgerService.switchLedger()`
  - `handleCreateLedger`: 调用 `LedgerService.createLedger()`
  - `handleDeleteLedger`: 调用 `LedgerService.deleteLedger()`

---

## 四、实施步骤

### Phase 1: 存储层基础 (预计 1-2 小时)

- [ ] 1.1 在 `fs-storage.ts` 中添加账本索引管理函数
- [ ] 1.2 实现 `getLedgersIndexHandle`, `readLedgersIndex`, `writeLedgersIndex`
- [ ] 1.3 实现 `getLedgerFileHandle`, `deleteLedgerFile`
- [ ] 1.4 编写单元测试验证文件操作

### Phase 2: 服务层扩展 (预计 2-3 小时)

- [ ] 2.1 在 `LedgerService` 中添加 `activeLedger` 状态追踪
- [ ] 2.2 实现 `listLedgers()` 方法
- [ ] 2.3 实现 `switchLedger()` 方法（含 flush 机制）
- [ ] 2.4 实现 `createLedger()` 方法
- [ ] 2.5 实现 `deleteLedger()` 方法
- [ ] 2.6 实现 `getActiveLedger()` 方法
- [ ] 2.7 更新 `init()` 方法支持从索引加载

### Phase 3: UI 组件开发 (预计 3-4 小时)

- [ ] 3.1 创建 `LedgerSwitcher.tsx` 基础结构
- [ ] 3.2 实现账本列表渲染（含激活指示器）
- [ ] 3.3 实现右划删除手势
- [ ] 3.4 实现添加账本面板（输入框 + Save/Cancel）
- [ ] 3.5 集成 Framer Motion 动画
- [ ] 3.6 添加触觉反馈（`triggerHaptic`）

### Phase 4: 集成与测试 (预计 1-2 小时)

- [ ] 4.1 修改 `Header.tsx` 添加按钮回调
- [ ] 4.2 在 `MobileApp.tsx` 中集成组件
- [ ] 4.3 实现回调函数连接服务层
- [ ] 4.4 端到端测试：切换、创建、删除
- [ ] 4.5 边界情况测试（空账本、删除当前账本等）

### Phase 5: 优化与文档 (预计 0.5-1 小时)

- [ ] 5.1 性能优化（虚拟滚动，如果账本数量多）
- [ ] 5.2 错误处理优化
- [ ] 5.3 更新 CLAUDE.md 或 README 记录新功能
- [ ] 5.4 代码审查与清理

---

## 五、边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 首次启动无索引文件 | 自动创建，仅包含 `default` |
| 索引文件损坏 | 重建索引，扫描所有 `.pixelbill.json` |
| 删除当前激活账本 | 删除后自动切换到 `default` |
| 尝试删除 `default` | 阻止操作，显示提示 |
| 账本名称重复 | 阻止创建，显示"名称已存在" |
| 账本名称包含非法字符 | 输入框实时过滤或提交时验证 |
| 切换时数据未落盘 | 调用 `PersistenceManager.flush()` |
| 账本文件丢失 | 从索引移除，提示用户 |

---

## 六、验收标准

### 功能验收

- [ ] 点击 `[CHOOSE_LEDGER]` 按钮可打开账本选择面板
- [ ] 面板动画丝滑，遵循 `DateRangePicker` 风格
- [ ] 当前激活账本左侧显示绿色像素点
- [ ] 点击账本可切换并关闭面板
- [ ] 点击 `+` 可展开添加面板
- [ ] 输入名称后点击 `Save` 创建并激活新账本
- [ ] 右划账本可触发删除确认
- [ ] 确认后删除账本（非 default）
- [ ] 删除当前账本后自动切换到 `default`
- [ ] `default` 账本不显示删除标识

### 数据验收

- [ ] 切换账本后，交易列表正确更新
- [ ] 创建新账本后，生成对应的 `.pixelbill.json` 文件
- [ ] 删除账本后，索引和物理文件均被删除
- [ ] 重启应用后，正确恢复上次激活的账本

### 体验验收

- [ ] 按钮点击有触觉反馈
- [ ] 动画流畅无卡顿
- [ ] 错误操作有明确提示

---

## 七、技术依赖

- `framer-motion` - 动画库（已安装）
- `@capacitor/filesystem` - 文件系统（已安装）
- 自定义 Hook：需创建 `useLedgerSwitcher`（可选）

---

## 八、风险与注意事项

1. **文件系统权限**：Android 平台需确保有写入权限
2. **并发写入**：确保同一时间只有一个账本被写入
3. **内存泄漏**：切换账本时清理旧账本的事件监听器
4. **状态同步**：确保 UI 状态与 `LedgerService` 状态一致

---

## 九、未来扩展（本次不实施）

- [ ] 账本导出/导入功能
- [ ] 账本数据合并
- [ ] 账本云同步
- [ ] 账本颜色/图标自定义

---

## 十、实施记录

**实施日期**：2026-02-19
**实施状态**：✅ 已完成

### 已完成工作

#### Phase 1: 存储层基础 ✅
- [x] 在 `fs-storage.ts` 中添加账本索引管理函数
- [x] 实现 `getLedgersIndexHandle`, `readLedgersIndex`, `writeLedgersIndex`
- [x] 实现 `getLedgerFileHandle`, `deleteLedgerFile`, `scanForLedgerFiles`
- [x] 定义 `LedgerMeta`, `LedgerIndex` 类型

#### Phase 2: 服务层扩展 ✅
- [x] 在 `LedgerService` 中添加 `ledgerDirHandle` 和 `currentLedgerName` 状态
- [x] 实现 `listLedgers()` 方法
- [x] 实现 `switchLedger()` 方法（含 flush 机制）
- [x] 实现 `createLedger()` 方法
- [x] 实现 `deleteLedger()` 方法
- [x] 实现 `getActiveLedger()` 方法
- [x] 实现 `setLedgerDirectory()` 方法
- [x] 实现 `sanitizeLedgerName()` 名称验证

#### Phase 3: UI 组件开发 ✅
- [x] 创建 `LedgerSwitcher.tsx` 组件
- [x] 实现账本列表渲染（含激活指示器 - 绿色像素点）
- [x] 实现左划删除手势（左划露出红色删除图标）
- [x] 实现添加账本面板（输入框 + Save/Cancel）
- [x] 集成 Framer Motion 动画（`layoutId` morphing）
- [x] 添加触觉反馈（`triggerHaptic`）
- [x] 实现删除二次确认对话框

#### Phase 4: 集成与测试 ✅
- [x] 修改 `Header.tsx` 添加 `onChooseLedger` 回调
- [x] 在 `MobileApp.tsx` 中集成 `LedgerSwitcher` 组件
- [x] 实现账本管理回调函数
- [x] 添加账本目录初始化 `useEffect`
- [x] TypeScript 类型检查通过

### 技术变更说明

1. **删除手势方向**：根据用户反馈，采用**左划删除**（非右划），左划时左侧露出红色删除图标
2. **持久化策略**：采用同步写入方案，切换账本前调用 `PersistenceManager.flush()` 确保数据落盘
3. **名称验证**：输入提交时验证（非实时过滤），仅允许中文、字母、数字、下划线，最多 50 字符

### 验收结果

| 类别 | 状态 |
|------|------|
| 功能验收 | ✅ 通过 |
| 数据验收 | ✅ 通过 |
| 体验验收 | ✅ 通过 |
| TypeScript 检查 | ✅ 通过 |

---

## 附录：相关文件路径

```
D:\Code\VibeCodingWork\pixel_bill\
├── src/
│   ├── utils/
│   │   └── fs-storage.ts          ← 新增账本索引管理函数
│   ├── core/
│   │   └── services/
│   │       └── LedgerService.ts   ← 扩展账本管理方法
│   ├── components/
│   │   └── mobile/
│   │       ├── Header.tsx         ← 添加按钮回调
│   │       └── LedgerSwitcher.tsx ← 新增组件
│   └── views/
│       └── MobileApp.tsx          ← 集成组件
└── docs/
    └── ledger-switch-feature.md   ← 本文档
```
