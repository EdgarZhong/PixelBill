# Tasks

- [x] Task 1: 优化流体光环 (Refine Flowing Aura)
  - [x] SubTask 1.1: 修改 `src/components/AuraOverlay.tsx`。
  - [x] SubTask 1.2: 调整 SVG `rect` 的 `strokeWidth` (e.g., 3px -> 4px)。
  - [x] SubTask 1.3: 更新 `strokeDasharray` 以包含更多段数 (5-6段) 且高光占比更高。
  - [x] SubTask 1.4: 调整动画 `duration` 至 8s-10s。
  - [x] SubTask 1.5: 增加 `filter: blur` 的半径，使光感更柔和。
  - [x] SubTask 1.6: 提高暗轨 (Dim Track) 的 opacity。

- [x] Task 2: 增强落袋脉冲 (Enhance Pulse)
  - [x] SubTask 2.1: 修改 `src/components/AuraOverlay.tsx` 中的 Pulse 动画部分。
  - [x] SubTask 2.2: 使用 `box-shadow` inset 动画替代或增强边框缩放。
  - [x] SubTask 2.3: 设置极大的 blur 半径，模拟宽光带向内收缩。
  - [x] SubTask 2.4: 确保高光颜色更亮 (e.g., emerald-400 or white mix)。

- [x] Task 3: 修复排版重叠 (Fix Layout Overlap)
  - [x] SubTask 3.1: 修改 `src/components/TransactionList.tsx`。
  - [x] SubTask 3.2: 为列表容器增加水平内边距 (`px-2` or similar)，确保内容不触碰光环边缘。

# Task Dependencies
- Tasks can be executed in parallel.
