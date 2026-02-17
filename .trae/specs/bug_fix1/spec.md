# 详情页 UI/UX 改进与交互设计 Spec

## Why

目前详情页仅为静态信息展示，缺乏用户与数据交互的能力（如修正分类、添加备注）。为了提升用户体验，需将其升级为集信息展示、AI 诊断、用户分类修正与备注编辑于一体的交互式终端，并采用符合项目设计哲学的“二级面板”与“无限轮盘”交互模式。

## What Changes

* **组件拆分**: 将 `MobileApp.tsx` 中的详情页部分拆分为独立的 `src/components/mobile/DetailPage.tsx`。

* **新增交互**:

  * **AI 诊断面板**: 顶部只读展示 AI 分类结果与推理逻辑。

  * **用户分类选择器**:

    * 采用 **二级面板 (Secondary Panel)** 模式，从普通按钮原位展开为全屏面板。

    * 内部集成 **竖版无限轮盘 (Vertical Infinite Carousel)** 进行分类选择。

    * 集成 **锁定 (Lock)** 机制，锁定后禁止修改。

  * **备注编辑器**:

    * 采用 **二级面板** 模式，展开后置于屏幕顶部，避免键盘遮挡。

* **视觉升级**:

  * 严格遵循 "Pixel & Cyber-Zen" 设计语言。

  * 统一使用绿色呼吸灯、像素字体、Framer Motion 布局动画。

## Impact

* **Affected Specs**: `MobileApp.tsx` (移除旧代码), `useAppLogic` (接口适配).

* **Affected Code**: `src/views/MobileApp.tsx`, `src/components/mobile/DetailPage.tsx` (New), `src/components/mobile/VerticalCategoryPicker.tsx` (New).

## ADDED Requirements

### Requirement: AI Diagnosis Panel (Top)

系统必须在详情页顶部展示 AI 的分析结果。

* **Layout**: 位于金额下方，作为一个独立的控制台区域。

* **Content**:

  * `DETECTED`: 显示 AI 推荐的分类 (如 `[MEAL]`)。

  * `REASON`: 显示 AI 的推理文本。

* **State**:

  * 若 AI 数据存在：正常显示。

  * 若 AI 数据缺失/加载中：显示骨架屏 (Skeleton) 并闪烁 `[AWAITING DATA]` 字样（半透明）。

* **Style**: 边框风格，深色背景，Monospace 字体。

### Requirement: Category Selector (Middle)

用户必须能够通过一个高交互性的组件修改交易分类。

#### Layout

* **Container**: 一行内左右布局。

* **Left**: **锁定图标 (Lock Icon)**。

  * **State**:

    * `Unlocked`: 灰色/暗淡，点击触发锁定动画。

    * `Locked`: 绿色高亮，点击触发解锁。

  * **Interaction**: 点击切换 `is_verified` 状态。锁定状态下，右侧选择器不可交互。

* **Right**: **分类选择按钮 (Category Button)** (二级面板入口)。

  * **Resting State**:

    * 形态：矩形按钮。

    * 内容：当前分类名称 (e.g., `MEAL`)，绿色呼吸灯像素字体。

    * 边框：细微边框，白色高亮。

  * **Open State (Secondary Panel)**:

    * 触发：点击按钮（且未锁定）。

    * 动画：按钮背板通过 `layoutId` 原地上下扩展，变为半屏高的面板背景。

    * 内容：展示 **竖版无限轮盘**。

#### Vertical Infinite Carousel (Inside Panel)

* **Design**: 参考主页横向轮盘，改为竖向。

* **Logic**:

  * **Infinite Loop**: 首尾通过 Buffer 数据实现无缝循环滚动。

  * **Selection**: 滚动停止时，自动吸附居中 (Snap to Center)。居中的项即为选中项。

  * **Visual**:

    * 选中项：放大、高亮、绿色像素字体。

    * 非选中项：缩小、变暗、灰色。

* **Data**: 使用 `ledgerMemory.defined_categories` 作为数据源。

### Requirement: Note Editor (Bottom)

用户必须能够编辑交易备注。

* **Interaction**: 同样采用 **二级面板** 模式。

* **Resting State**: 显示当前备注文本（或 "ADD NOTE..." 占位符），下划线样式。

* **Open State**:

  * 面板展开至 **屏幕上方 (Top of Screen)**，预留底部空间给虚拟键盘。

  * 自动聚焦输入框。

  * 面板右下方设置提交按钮，不依赖enter。

* **Locking**: 若条目已锁定，输入框置灰禁用。

## MODIFIED Requirements

### Requirement: MobileApp Integration

* `MobileApp.tsx` 不再直接渲染详情页 DOM。

* 引入 `<DetailPage />` 组件，并通过 Props 传递 `transaction`, `onUpdate`, `onClose` 等。

* 保持 Slide-in (`x: '100%'` -> `0%`) 进场动画。

## Design Implementation Details (Strict Compliance)

* **Framer Motion**: 必须使用 `layoutId` 实现二级面板的变形动画，确保与 `DateRangePicker` 体验一致。

* **Portal**: 展开态必须渲染到 `document.body` (使用 `createPortal`) 以突破父容器 `overflow` 限制。

* **Z-Index**: 面板层级 `z-[9999]`，遮罩层 `z-[9998]`。

* **Colors**:

  * `Pixel Green`: `#10b981` (用于高亮、呼吸灯)。

  * `Background`: `#09090b` / `#111111`。

* **Fonts**: `Space Mono` (数据/正文), `Press Start 2P` (仅少量装饰)。

## Validation

* [ ] 锁定动画是否流畅？锁定后是否真的禁止了编辑？

* [ ] 竖版轮盘是否能无限平滑滚动？选中项是否居中高亮？

* [ ] 备注编辑面板是否会被键盘遮挡？

* [ ] AI 面板在无数据时是否显示骨架屏？

