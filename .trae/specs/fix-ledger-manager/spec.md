# 修复账本管理器规格说明书 (Fix Ledger Manager Spec)

## 背景 (Why)
目前的账本管理器实现存在几个关键问题：
1. **数据隔离错误**：账本索引文件 `ledgers.json` 错误地存储在用户可见的 `Documents` 目录下，应该存储在应用沙箱 `Directory.Data` 中。
2. **新账本不可用**：切换到新创建的空账本后，`[ADD_SOURCE]` 按钮呈灰色禁用状态，导致无法导入数据。
3. **交互体验不符**：账本删除功能的交互逻辑与设计要求不符。用户期望“左滑删除”手势，松手后在二级面板内显示确认覆盖层，而不是全局弹窗。

## 变更内容 (What Changes)

### 存储层 (Storage Layer)
- **修正**：确保 `ledgers.json`（索引文件）严格存储在应用沙箱（`Directory.Data`）中，不再出现在 `Directory.Documents` 下。
- **原因**：索引文件属于应用内部元数据，不应干扰用户的文档目录。

### UI 逻辑 (Header)
- **修正**：在 `Header` 组件中，即使账本为空（`!hasData`），也必须启用 `[ADD_SOURCE]` 按钮。
- **原因**：用户必须能够向新创建的（空）账本导入 CSV 文件。

### UI 交互 (LedgerSwitcher)
- **重构**：实现正确的“左滑删除”交互。
    - **手势**：向左滑动账本条目。
    - **视觉**：滑动时，条目右侧露出红色删除标识（底色）。
    - **触发**：滑动超过阈值（如 -80px）后**松手**，触发确认状态。
- **重构**：删除确认 UI。
    - **移除**：全局全屏模态框。
    - **新增**：在 `LedgerSwitcher` 面板内部的绝对定位覆盖层。
    - **内容**：覆盖面板原有内容，显示“确认删除 [账本名]？”及“确认/取消”按钮。
    - **动画**：使用 `AnimatePresence` 实现平滑过渡。

## 影响范围 (Impact)
- **涉及文档**：`ledger-switch-feature.md`（需更新实现细节）。
- **涉及代码**：
    - `src/utils/fs-storage.ts`: `readLedgersIndex`, `writeLedgersIndex`, `getLedgersIndexHandle`。
    - `src/components/mobile/Header.tsx`: `[ADD_SOURCE]` 按钮的 `disabled` 逻辑。
    - `src/components/mobile/LedgerSwitcher.tsx`: 重写 `LedgerItem` 交互和确认对话框布局。

## 新增/修改需求 (Requirements)

### 需求：账本索引存储
系统必须将 `ledgers.json` 存储在应用沙箱（`Directory.Data`）中，确保对用户文件系统不可见，同时保持单个 `*.pixelbill.json` 账本文件在 `Directory.Documents` 中以便用户管理。

### 需求：数据导入可用性
即使当前账本没有交易记录，`[ADD_SOURCE]` 按钮也必须保持可用状态，允许用户填充新账本。

### 需求：删除账本交互
- **当**用户向**左**滑动账本条目时：
    - 条目**右侧**应露出红色“删除”图标/底色。
- **当**用户在滑动超过阈值后松手时：
    - 滑动动作应触发确认状态。
- **于是**一个确认覆盖层应出现，**覆盖 Ledger Switcher 面板的内容**（而非全屏）。
    - 覆盖层应显示“确认删除 [名称]？”并提供“确认/取消”选项。
