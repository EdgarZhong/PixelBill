# 账本二级面板性能与收起形变修复 Spec

## Why
当前二级面板在展开时出现明显卡顿，且收起时会出现按钮单独跳出并带弹性动画，破坏“同一性原则”。需要在不修改 DESIGN.md 的前提下先修复性能与收起形变问题。

## What Changes
- 优化面板展开时的渲染性能，降低首帧卡顿。
- 修复收起时按钮“跳出”的视觉断层，确保面板严格缩回为按钮。
- 维持“同源 DOM”与透明占位块策略，不允许展开/收起过程中出现额外按钮插入。

## Impact
- Affected Specs: 二级面板交互规范（暂不修改 DESIGN.md）
- Affected Code:
  - `src/components/mobile/LedgerSwitcher.tsx`

## ADDED Requirements
### Requirement: 展开性能优化
系统 SHALL 优化面板展开首帧渲染，减少卡顿感。

#### Scenario: Open Panel
- **WHEN** 用户点击 `[CHOOSE_LEDGER]`
- **THEN** 面板展开 SHALL 不出现可感知的卡顿

### Requirement: 收起严格归位
系统 SHALL 保证面板收起过程是“严格缩回为按钮”的逆动画，避免按钮单独跳出。

#### Scenario: Close Panel
- **WHEN** 用户点击遮罩关闭面板
- **THEN** 面板 SHALL 直接缩回按钮位置，无额外按钮弹出

## MODIFIED Requirements
### Requirement: 收起视觉一致性
**Old**: 收起时按钮会单独出现并产生弹性视觉  
**New**: 收起时仅由面板形变回按钮，无独立按钮动画  
**Reason**: 保持同一性与视觉连续性
