# 账本二级面板交互修复 Spec

## Why
当前 `LedgerSwitcher` 二级面板存在“弹性感”动画与错误的自动关闭行为，点击面板内部会导致面板反复消失与重现，破坏了用户操作连续性与二级面板的“同源性”体验。

## What Changes
- 去除按钮与面板展开/回收动画中的弹性感，统一为无弹性缓动。
- 修复面板内点击触发面板自动关闭的逻辑，除非点击面板外侧遮罩，否则不主动关闭。
- 展开后原位置按钮不再出现，使用完全透明且等尺寸的占位块稳定布局。

## Impact
- Affected Specs: `DESIGN.md`（二级面板交互规范需要同步）
- Affected Code:
  - `src/components/mobile/LedgerSwitcher.tsx`

## ADDED Requirements
### Requirement: 无弹性感展开与回收
系统 SHALL 使用非弹性缓动完成按钮与面板之间的形变动画。

#### Scenario: Expand
- **WHEN** 用户点击 `[CHOOSE_LEDGER]`
- **THEN** 按钮 SHALL 以无弹性感缓动形变为面板

#### Scenario: Collapse
- **WHEN** 用户点击面板外遮罩
- **THEN** 面板 SHALL 以无弹性感缓动收回为按钮

### Requirement: 面板内点击不关闭
系统 SHALL 仅在点击面板外遮罩时关闭面板，面板内的任何点击均不触发关闭。

#### Scenario: Inside Interaction
- **WHEN** 用户在面板内部点击任意区域或操作控件
- **THEN** 面板 SHALL 保持打开状态

### Requirement: 原位置按钮占位
系统 SHALL 在面板展开后，用完全透明且等尺寸的占位块维持 Header 布局稳定，且该占位块不可交互。

#### Scenario: Layout Stability
- **WHEN** 面板展开完成
- **THEN** Header 中原按钮位置 SHALL 由透明占位块保持尺寸

## MODIFIED Requirements
### Requirement: 二级面板关闭条件
**Old**: 选择账本等内部操作会关闭面板  
**New**: 仅点击外侧遮罩时关闭面板  
**Reason**: 保证面板内部操作稳定可靠，避免误关闭
