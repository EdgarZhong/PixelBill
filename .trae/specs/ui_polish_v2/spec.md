# UI Polish V2 Spec

## Why
用户反馈了关于 AI 引擎 UI 交互的三个具体问题：光环动画误触发、光环视觉效果需要优化、控制图标交互性不明确。为了提升用户体验，需要针对性地修复 Bug 并优化视觉表现。

## What Changes

### 1. 修复 Bug：光环误触发
*   **问题**: 切换分类标签页或翻页时误触发“落袋”脉冲动画。
*   **原因**: `TransactionList` 组件在 `handlePageChange` 和手势翻页逻辑中，以及父组件 `MobileApp` 在标签切换时，可能意外触发了 `auraRef.current?.pulse()` 或传递了变化的 `pulseTrigger`。实际上，`pulse` 应该仅由 AI 引擎的 `dayCompleted` 事件触发。
*   **修复**: 移除 `TransactionList` 内部翻页逻辑中的 `auraRef.current?.pulse()` 调用。确保 `pulse` 仅响应 `pulseTrigger` prop 的变化，而 `pulseTrigger` 仅由 AI 引擎事件驱动。

### 2. 优化光环视觉效果 (The Flowing Aura)
*   **问题**: 当前光环效果单一。
*   **新设计**: 
    *   **暗轨**: 完整的绿色光环轨道（低透明度/较暗）。
    *   **高光流**: 多段（3-4段）高亮、散光的绿色环段在轨道上同向流动。
    *   **平滑过渡**: 高光段边缘需柔和过渡。
    *   **律动**: 逸散的柔光伴随运动产生呼吸感或律动。
*   **实现**: 使用 SVG `stroke-dasharray` 和 `stroke-dashoffset` 配合 Framer Motion 实现多段流动效果，叠加模糊滤镜实现柔光。

### 3. 优化控制图标 (The Control Unit)
*   **问题**: 图标太小，且缺乏“开关”的视觉隐喻。
*   **新设计**:
    *   **尺寸**: 增大图标触控区域和视觉大小。
    *   **光晕**: 在高亮状态（Working/Stopping/Error）下添加对应颜色的光晕 (`box-shadow` 或 SVG滤镜)，增强“能量感”。
    *   **呼吸**: 保持 Working 状态的呼吸动画，但加强光晕的扩散收缩。

## Impact
*   **组件**: `src/components/TransactionList.tsx`, `src/components/AuraOverlay.tsx`, `src/components/mobile/Header.tsx`
*   **视觉**: 显著提升 AI 工作时的视觉反馈质量。

## ADDED Requirements
### Requirement: Precise Pulse Triggering
The "Pulse" animation SHALL ONLY be triggered by the AI Engine's `dayCompleted` event. It MUST NOT be triggered by UI interactions like pagination or tab switching.

### Requirement: Advanced Flowing Aura
The Aura SHALL consist of a dim base track and multiple flowing high-light segments.
- Segments: 3-4 distinct bright green segments.
- Motion: Continuous clockwise flow.
- Aesthetics: Soft edges, glowing effect.

### Requirement: Enhanced Control Icon
The AI Control Icon SHALL be easily recognizable as an interactive toggle.
- Size: Increased visual footprint (e.g., larger icon or padding).
- Glow: Colored glow effect matching the current state (Green/Yellow/Red).

## MODIFIED Requirements
### Requirement: TransactionList Interaction
**Removed**: Triggering pulse on page change/swipe.
