# 任务列表 (Tasks)

- [x] 任务 1: 修复账本索引存储位置
    - [x] 修改 `src/utils/fs-storage.ts` 中的 `getLedgersIndexHandle`，确保其使用 `Directory.Data`。
    - [x] 验证 `readLedgersIndex` 和 `writeLedgersIndex` 是否正确跟随 `getLedgersIndexHandle` 的目录设置（或显式指定 `Directory.Data`）。
    - [x] 编写简单的测试脚本或手动验证文件是否生成在正确位置。

- [x] 任务 2: 修复 Header "Add Source" 按钮状态
    - [x] 修改 `src/components/mobile/Header.tsx`，从 `[ADD_SOURCE]` 按钮的 `disabled` 条件中移除 `!hasData` 检查。
    - [x] 确保 `disabled` 仅关联 `isLoading` 状态。

- [x] 任务 3: 重构 LedgerSwitcher UI 交互
    - [x] 修改 `src/components/mobile/LedgerSwitcher.tsx` 中的 `LedgerItem` 组件：
        - [x] 调整布局，将删除图标背景放置在右侧（用于左滑露出）。
        - [x] 调整 `motion.div` 的 `drag` 约束，允许向左滑动（负 X 轴）。
        - [x] 实现 `onDragEnd` 逻辑：当滑动超过阈值（如 -80px）时，设置删除确认状态。
    - [x] 修改 `LedgerSwitcher` 容器组件：
        - [x] 移除原本的 `DeleteConfirmDialog` 全局定位。
        - [x] 创建一个新的 `DeleteOverlay` 组件，绝对定位在 `LedgerSwitcher` 面板内部，覆盖列表和按钮。
        - [x] 设计符合 Cyber-Zen 美学的确认界面（红/黑配色，像素字体）。
        - [x] 集成确认和取消的回调逻辑。
