# Tasks

- [x] Task 1: 修复光环误触发 Bug (Fix Pulse Trigger Bug)
  - [x] SubTask 1.1: 检查 `src/components/TransactionList.tsx`，移除 `handlePageChange` 和 `handleTouchEnd` (swipe) 中的 `auraRef.current?.pulse()` 调用。
  - [x] SubTask 1.2: 确认 `pulseTrigger` prop 仅在 `MobileApp.tsx` 中由 `dayCompleted` 事件更新。

- [x] Task 2: 优化光环视觉效果 (Enhance Aura Visuals)
  - [x] SubTask 2.1: 重构 `src/components/AuraOverlay.tsx`。
  - [x] SubTask 2.2: 实现“暗轨”背景（低透明度描边）。
  - [x] SubTask 2.3: 实现“多段高光流”（使用 `strokeDasharray` 模拟多段，或多个 `motion.rect`）。建议使用 `strokeDasharray` 配合 `strokeDashoffset` 动画实现多段流动。
  - [x] SubTask 2.4: 添加高斯模糊 (`filter: blur`) 层以实现柔光逸散效果。

- [x] Task 3: 优化控制图标 (Enhance Control Icon)
  - [x] SubTask 3.1: 修改 `src/components/mobile/Header.tsx`。
  - [x] SubTask 3.2: 增大 `Cpu` 图标尺寸 (e.g., size={20} or {24}) 和按钮 `padding`。
  - [x] SubTask 3.3: 为不同状态添加 `drop-shadow` 或 `box-shadow` 光晕效果。
    - Analyzing: Green Glow
    - Stopping: Yellow Glow
    - Error: Red Glow

# Task Dependencies
- Task 2 and Task 3 are independent visual updates.
- Task 1 is a logic fix.
