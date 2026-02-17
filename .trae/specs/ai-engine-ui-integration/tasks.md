# Tasks

- [x] Task 1: 升级 AI 引擎核心逻辑 (Upgrade AI Engine Core)
  - [x] SubTask 1.1: 修改 `BatchProcessor.ts`，引入 `EventEmitter` 或类似机制。
  - [x] SubTask 1.2: 在 `run()` 循环中，每当一天处理完成（`proposalHandler` 调用后），触发 `dayCompleted` 事件。
  - [x] SubTask 2.4: 将 `AuraOverlay` 集成到 `TransactionList.tsx` 中，确保不影响现有布局和滚动。

- [x] Task 2: 实现光环系统 (Implement Aura System)
  - [x] SubTask 2.1: 创建 `src/components/AuraOverlay.tsx` 组件。
  - [x] SubTask 2.2: 使用 Framer Motion 实现 `Flowing` (边缘流动) 动画。
  - [x] SubTask 2.3: 使用 Framer Motion 实现 `Pulse` (向内收缩闪烁) 动画。
  - [x] SubTask 2.4: 将 `AuraOverlay` 集成到 `TransactionList.tsx` 中，确保不影响现有布局和滚动。

- [ ] Task 3: 实现 AI 控制单元 (Implement Control Unit)
  - [x] SubTask 3.1: 修改 `Header.tsx`，移除旧版加载按钮（或重构）。
  - [x] SubTask 3.2: 实现新的控制按钮，包含 `Idle` (灰), `Working` (绿+呼吸), `Fault` (黄) 样式。
  - [x] SubTask 3.3: 绑定点击事件：点击启动 -> 调用 `AIEnginePlugin.runBatchAnalysis`；点击停止 -> 调用 `BatchProcessor.stop`。
  - [x] SubTask 3.4: 修改 `src/components/mobile/Header.tsx` 以适配移动端设计要求。

- [x] Task 4: 集成与状态管理 (Integration & State Wiring)
  - [x] SubTask 4.1: 在 `TransactionList` 或上层组件中订阅 `BatchProcessor` 的状态和事件。
  - [x] SubTask 4.2: 连接 `dayCompleted` 事件到 `AuraOverlay` 的 `Pulse` 触发器。
  - [x] SubTask 4.3: 实现 "Decoupled Feedback" 逻辑：用户点击停止后，按钮立即变灰，但 `AuraOverlay` 保持流动直至 `BatchProcessor` 真正变回 `IDLE`。

# Task Dependencies
- [Task 2] depends on [Task 1] (需要事件触发 Pulse)
- [Task 4] depends on [Task 2] & [Task 3]
