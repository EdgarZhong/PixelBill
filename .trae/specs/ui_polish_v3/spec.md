# UI Polish V3 Spec

## Why
用户反馈了关于“流体光环”和“排版”的进一步视觉优化需求。当前的光环效果过于生硬、速度过快、暗部太暗，且与右侧金额文字重叠。落袋动画需要更强的能量感和柔和的光晕效果。

## What Changes

### 1. 优化光环视觉 (The Ethereal Aura)
*   **增加高光段数**: 将光环的高光段数增加到 **5-6 段**，并提高其在整个轨道中的占比，减少暗部面积。
*   **提升暗部亮度**: 提高暗轨 (Dim Track) 的透明度 (e.g., opacity 0.3 -> 0.4)，使其更清晰。
*   **舒缓流动**: 显著降低流动速度 (duration 3s -> 8s+)，营造“流体”和“呼吸”感。
*   **柔化过渡**: 加大高斯模糊 (`blur`) 的程度，使明暗交替更加平滑，无明显边界。
*   **宽度调整**: 稍微增加光环的描边宽度，增强存在感。

### 2. 修复排版重叠 (Layout Fix)
*   **问题**: 光环右侧侵入交易列表金额区域。
*   **修复**: 
    *   调整 `TransactionList` 内部布局，确保内容容器 (Container) 与光环容器 (AuraOverlay) 之间有足够的安全边距 (Padding)。
    *   或者调整 `AuraOverlay` 的尺寸，使其向外扩张而不是向内挤压，或者在 `TransactionList` 增加内边距。
    *   **策略**: 给 `TransactionList` 的列表容器增加 `px-1` 或 `px-2`，确保文字不紧贴边缘。

### 3. 增强落袋动画 (Imploding Pulse)
*   **高光增强**: 脉冲瞬间的高光强度必须极高 (Bright White/Green)。
*   **宽光带向内收缩**: 
    *   动画开始时，光带应基于当前光环状态，但迅速变得极宽（模糊成光晕）。
    *   执行向内收缩 (Inset) 动画，而非简单的“套圈”缩小。
    *   使用 `box-shadow` 的 `inset` 属性配合极大的模糊半径来实现“光晕收缩”效果，避免锐利的线条感。

## Impact
*   **组件**: `src/components/AuraOverlay.tsx`, `src/components/TransactionList.tsx`
*   **视觉**: 更加高级、柔和且具有能量感的 AI 交互反馈。

## ADDED Requirements
### Requirement: Ethereal Flow
The Aura SHALL flow slowly (approx 8-10s per cycle) with 5-6 soft, overlapping high-light segments covering >50% of the track.

### Requirement: Layout Safety
The Transaction List content (especially the right-aligned amount) SHALL NOT overlap with the Aura visuals. A minimum padding MUST be enforced.

### Requirement: Volumetric Pulse
The Pulse animation SHALL appear as a volumetric implosion of light, not a shrinking stroke. It MUST use large blur radii and high brightness.
