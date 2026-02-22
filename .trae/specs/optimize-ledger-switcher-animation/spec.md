# Ledger Switcher Animation Optimization Spec

## Why
当前 `LedgerSwitcher` 组件的展开/回收动画与 `DateRangePicker` 风格不一致，缺乏物理形变感（Morphing）。Trigger（按钮）与 Modal（面板）分离，违反了“同源性”和“展开基态原则”，导致动画突兀，缺乏“生长”感。

## What Changes
- **重构 `LedgerSwitcher` 组件**：使其成为自包含组件，同时管理“常态”（Trigger 按钮）和“展开态”（Modal 面板）。
- **迁移组件位置**：将 `LedgerSwitcher` 从 `MobileApp` 底部移至 `Header` 组件内部，替换原有的 `[CHOOSE_LEDGER]` 按钮。
- **实施 `layoutId` 动画**：利用 Framer Motion 的 Shared Layout 技术，实现从按钮到全屏面板的平滑形变。
- **优化数据加载体验**：改为“点击即展开，数据异步更新”，消除点击后的等待延迟。

## Impact
- **Affected Specs**: `DESIGN.md` (二级面板交互规范)
- **Affected Code**:
    - `src/components/mobile/LedgerSwitcher.tsx` (Major Refactor)
    - `src/components/mobile/Header.tsx` (Integration)
    - `src/views/MobileApp.tsx` (Props passing & Cleanup)

## ADDED Requirements
### Requirement: 丝滑形变动画
The system SHALL provide a seamless morphing animation when toggling the ledger switcher.

#### Scenario: Expand
- **WHEN** user taps the `[CHOOSE_LEDGER]` button
- **THEN** the button SHALL morph into the full-screen modal panel.
- **AND** the text `[CHOOSE_LEDGER]` SHALL glide from the button center to the modal header.

#### Scenario: Collapse
- **WHEN** user closes the panel
- **THEN** the panel SHALL shrink back into the button.
- **AND** the animation MUST be the strict reverse of the expansion.

### Requirement: 展开基态原则
The `LedgerSwitcher` component SHALL contain the full structure of the expanded state in its code, using `layoutId` and `AnimatePresence` to toggle between the compact (trigger) and expanded (modal) visual states.

## MODIFIED Requirements
### Requirement: 数据加载时机
**Old**: Click -> Await Load -> Open
**New**: Click -> Open (Morph) -> Async Load (Update List)
**Reason**: To ensure immediate visual feedback and smoother animation start.
