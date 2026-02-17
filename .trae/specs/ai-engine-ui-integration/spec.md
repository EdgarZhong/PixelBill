# AI Engine UI/UX 集成规格说明书 (AI Engine UI/UX Integration Spec)

## 为什么 (Why)
目前的 AI 引擎虽然功能完备，但缺乏用户可见的控制手段和状态反馈。为了提升用户体验，我们需要引入 **"Soft Stop" (软停止)** 和 **"Decoupled Feedback" (解耦反馈)** 机制，并通过视觉化的 **"Aura System" (光环系统)** 让后台处理过程变得透明且富有生命力。这不仅是功能需求，更是为了契合 "赛博禅意" 的核心设计哲学。

## 变更内容 (What Changes)

### 1. 核心引擎升级 (Core Engine Upgrade)
-   **新增事件**: `BatchProcessor` 将新增 `dayCompleted` 事件，用于精确触发每日处理完成时的 "Pulse" 动画。
-   **状态细化**: 明确区分 `STOPPING` (正在软停止) 和 `IDLE` (完全停止) 状态，确保 UI 能正确显示“收尾中”的过渡状态。

### 2. UI 组件新增与改造 (UI Component Updates)
-   **Header 组件**:
    -   新增 **AI 控制单元 (Control Unit)**：位于 Header 右侧，替代原本的加载按钮或作为独立模块。
    -   实现 **呼吸流光 (Breathing Animation)**：在 `WORKING` 状态下，图标颜色与透明度按 4s 周期律动。
    -   实现 **即时反馈 (Immediate Feedback)**：点击停止后按钮立即变灰，但内部状态保持 `STOPPING` 直至引擎真正停止。
-   **TransactionList 组件**:
    -   新增 **光环层 (Aura Overlay)**：一个覆盖在列表容器上的透明层，用于渲染光环动画。
    -   实现 **Flowing (流动)** 效果：绿色光环沿边缘顺时针流动。
    -   实现 **Pulse (脉冲)** 效果：接收到 `dayCompleted` 事件时，触发向内收缩的高光闪烁。
    -   实现 **Extinguish (熄灭)** 效果：仅在引擎完全 `IDLE` 时移除光环。

## 影响范围 (Impact)
-   **核心逻辑**: `src/core/ai_engine/BatchProcessor.ts`
-   **UI 组件**: `src/components/Header.tsx`, `src/components/TransactionList.tsx`
-   **新增文件**: `src/components/AuraOverlay.tsx` (建议新建，以保持 `TransactionList` 的整洁)

## 新增需求 (ADDED Requirements)

### Requirement: AI Engine Events
系统必须提供精确的进度事件流。
-   **当** AI 引擎完成一天的所有交易分类并生成 Proposal 后，
-   **必须** 立即触发 `dayCompleted` 事件（携带日期信息），
-   **以便** UI 层能精确触发 "Pulse" 动画，而无需轮询状态。

### Requirement: Control Unit (Header)
Header 右侧必须包含一个抽象的 AI 控制按钮。
-   **Idle**: 暗淡灰色 (`text-dim` / `opacity-50`) + 白色勾边。
-   **Working**: 翡翠绿 (`text-pixel-green`) + 4s 呼吸动画。
-   **Stopping**: 按钮立即变回 **Idle** 样式（响应用户点击），但系统内部保持运行直至当前任务完成。
-   **Fault**: 黄色常亮，点击显示错误信息。

### Requirement: Aura System (Visual Feedback)
TransactionList 必须被一个“光环”包裹。
-   **Flowing**: 在 `ANALYZING` 或 `STOPPING` 状态下，绿色光环持续流动。
-   **Pulse**: 在 `dayCompleted` 事件触发时，光环执行一次向内收缩的高光闪烁。
-   **Extinguish**: 当且仅当状态变为 `IDLE` 时，光环消失。

## 修改需求 (MODIFIED Requirements)

### Requirement: BatchProcessor State Management
`BatchProcessor` 的状态机需要扩展以支持 UI 的细粒度控制。
-   **原逻辑**: `stop()` 仅设置标志位。
-   **新逻辑**: `stop()` 设置标志位后，通过事件或状态属性通知 UI 进入 "Stopping" 阶段，但 `status` 字段保持 `ANALYZING` 直至真正结束，或者新增一个 `isStopping` 标志供 UI 查询。

## 移除需求 (REMOVED Requirements)
-   **移除**: Header 中的旧版 `[LOAD_DATA_SOURCE]` 按钮将被新的 AI 控制单元取代（或集成其中，视具体布局空间而定，设计文档暗示替换）。
