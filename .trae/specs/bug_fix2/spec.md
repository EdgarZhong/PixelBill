# Bug Fix & UX Refinement Spec (Fix 2)

## Why

在上一轮修复后，仍残留“修改后自动锁定”、“缺失原始流水号”等 Bug，且二级面板样式与 `DateRangePicker` 及主页轮盘不一致，缺乏设计一致性。

## What Changes

* **修复逻辑 (Fix Logic)**:

  * 彻底移除 `MobileApp.tsx` 中 `updateCategory` 调用后的自动锁定逻辑。

  * `DetailPage` 的 `onUpdate` 回调需区分“内容更新”与“状态更新”。

  * 确保 `originalId` 正确传入并展示。

* **UI/UX 深度复刻 (Visual Replication)**:

  * **Category Selector**:

    * **Trigger**: 非锁定态改为 `border-white/50` + `text-pixel-green` (呼吸)。

    * **Panel**: 严格复刻 `DateRangePicker` 样式（`bg-card/30`, `border-white/5`, `backdrop-blur`）。

    * **Content**: 初始展开时即显示内容（修复空白问题），自动滚动到当前选中项。

    * **Carousel**: 竖版复刻主页 `MobileApp` 的 `TABS` 轮盘样式（字体、间距、高亮逻辑），仅去除原轮盘的底部绿条。

  * **Note Editor**:

    * 复刻 `DateRangePicker` 面板样式。

    * 位置保持屏幕上部，增加高度。

    * 右上角 `X` 改为右下角 `Save` 图标。

  * **Detail Page**:

    * 背景保留主页点阵背景 (`bg-dot-matrix`)。页面切换时保持背景静止。

    * 卡片圆角缩小 (`rounded-sm`)。

## Impact

* **Affected Specs**: `bug_fix1` (superseded)

* **Affected Code**:

  * `src/views/MobileApp.tsx` (Logic)

  * `src/components/mobile/DetailPage.tsx` (Style/Props)

  * `src/components/mobile/CategorySelector.tsx` (Style/Logic)

  * `src/components/mobile/VerticalCategoryPicker.tsx` (Style)

  * `src/components/mobile/NoteEditor.tsx` (Style)

## ADDED Requirements

### Requirement: Consistent Panel Style

二级面板（分类、备注）必须严格复刻 `DateRangePicker` 的视觉风格：

* **Container**: `bg-card border border-gray-600 shadow-[0_0_15px_rgba(255,255,255,0.05)] rounded-lg`.

* **Backdrop**: `bg-black/40 backdrop-blur-[1px]`.

* **Animation**: `type: "tween", ease: "easeInOut", duration: 0.3`.

### Requirement: Vertical Carousel Replication

竖版轮盘必须复刻主页横向轮盘的视觉细节：

* **Font**: `font-pixel` (Press Start 2P) for labels.

* **Active State**: `text-pixel-green`, `scale: 1.1`.

* **Inactive State**: `text-gray-400`, `scale: 1.0`, `opacity: 0.5`.

* **Indicator**: REMOVE the bottom green bar (as requested).

## MODIFIED Requirements

### Requirement: No Auto-Lock on Edit

* 修改分类 (`category`) 或 备注 (`user_note`) 时，**严禁** 修改 `is_verified` 字段。

* 仅点击锁定图标时切换 `is_verified`。

### Requirement: Original Serial Number

* 确保 `transaction.originalId` 在 `DetailPage` 中正确渲染。

* 样式：`text-dim text-[10px] font-mono`.

### Requirement: Note Editor Layout

* **Position**: Top of screen (unchanged).

* **Height**: Increased (e.g., `h-48`).

* **Action**: Remove Top-Right 'X'. Add Bottom-Right 'Save' Icon/Button.

## REMOVED Requirements

* **Removed**: "Clean Modern Pixel" flat style (solid black bg) from Fix 1. Reverted to `DateRangePicker` style (translucent card + blur).

