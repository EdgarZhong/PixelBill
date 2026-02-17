# UI Refinement & Unification Spec

## Why
目前详情页的 UI 风格与主页存在割裂感，主要体现在卡片布局碎片化、字体大小不统一、组件细节（如圆角、呼吸灯）与整体“像素硬朗”风格不符。此外，原始流水号虽已实现但未被用户感知。

## What Changes
- **卡片合并 (Card Merge)**: 将“用户分类”和“用户备注”合并为一个统一的“USER EDIT”面板，采用深蓝色顶部标签（类似 AI Diagnosis）。
- **文字统一 (Text Standardization)**:
  - 标题全大写英文 (e.g., `CATEGORY`, `NOTE`, `TIME`, `PRODUCT`).
  - 字体大小严格分级：Title (10px, bold), Body (text-sm/xs, mono), Label (Pixel font).
- **视觉降噪 (Visual Polish)**:
  - 移除 `CategorySelector` 和 `NoteEditor` 触发器的 `animate-pulse`（呼吸闪烁）。
  - 统一边框风格：细白线高亮，移除多余装饰。
  - `NoteEditor` 二级面板：移除保存按钮的圆形背景，仅保留图标。
  - 锁定按钮：背板颜色与卡片背景完全一致，消除色差。
- **AI 标签优化**:
  - 颜色改为黄色 (`text-yellow-500`)。
  - 逻辑：若用户已修改分类，AI 标签置灰 (`text-dim`)；若用户未修改，AI 标签高亮。
- **原始流水号**: 确保展示并排查可见性。

## Impact
- **Affected Specs**: `bug_fix2` (Refinement)
- **Affected Code**:
  - `src/components/mobile/DetailPage.tsx`
  - `src/components/mobile/CategorySelector.tsx`
  - `src/components/mobile/NoteEditor.tsx`

## MODIFIED Requirements

### Requirement: Unified User Edit Card
创建一个新的组合卡片，包含分类选择和备注编辑。
- **Header**: 深蓝色背景条，标题 `USER EDIT`。
- **Body**: 包含 `CategorySelector` 和 `NoteEditor`，中间用细线分隔或通过间距区分。

### Requirement: Typography System
- **Section Title**: `text-[10px] text-dim font-bold tracking-wider uppercase`.
- **Content Text**: `text-primary font-mono text-xs`.
- **Interactive Label**: `font-pixel text-sm` (Category Button).

### Requirement: Component Styles
- **Note Editor**:
  - Trigger: `border-white/50` (No pulse).
  - Panel: Save button is just an icon, bottom-right.
- **Category Selector**:
  - Trigger: `border-white/50` (No pulse).
  - Lock Button: `bg-card` (Matches parent card).
- **AI Label**:
  - Active (User hasn't overridden): Yellow.
  - Inactive (User overrode): Gray/Dim.

### Requirement: Original Serial Number
- Display field: `ORIGINAL_ID`.
- Position: Below `TRANSACTION_ID` or merged into Meta section.
