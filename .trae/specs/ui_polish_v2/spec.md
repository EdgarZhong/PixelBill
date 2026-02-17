# UI Polish & Original ID Fix Spec

## Why
目前 UI 存在细节不统一（顶栏高度、色调），交互反馈（呼吸灯、颜色变化）未达预期。且 `originalId` 虽在代码逻辑中存在，但 JSON 文件中缺失，导致无法显示。

## What Changes
- **UI Unification**:
  - 统一 `User Edit` 和 `AI Diagnosis` 卡片的顶栏高度和色调（灰度版主题绿）。
  - 统一字体大小规格（Title, Body, Label）。
- **Interaction Logic**:
  - **Category Label**:
    - Locked: Green Solid.
    - Unlocked: Green Breathing (4s cycle).
  - **User Note**:
    - Locked: Dim/Gray.
    - Unlocked: Green Breathing (sync with label).
  - **Lock Icon/Border**: Keep current style.
- **Data Fix**:
  - 重新导入/处理 CSV 以补充 JSON 中缺失的 `originalId`。
  - 验证 `LedgerService` 的合并逻辑，确保新导入的 `originalId` 能正确合并到现有记录中而不覆盖用户分类。

## Impact
- **Affected Specs**: `ui_polish` (Refinement)
- **Affected Code**:
  - `src/components/mobile/DetailPage.tsx`
  - `src/components/mobile/CategorySelector.tsx`
  - `src/components/mobile/NoteEditor.tsx`
  - `default.pixelbill.json` (Data file update via re-import or script)

## MODIFIED Requirements

### Requirement: Unified Header Style
- **Height**: Standardized (e.g., `py-1.5` or `h-8`).
- **Color**: Desaturated Theme Green (`bg-pixel-green/10 text-pixel-green border-b border-pixel-green/20`). *User said "Grayscale version of theme green", so maybe `bg-gray-900` with green tint text? Or `bg-[#1a2e25]`? Let's use `bg-pixel-green/5`.*
- **Title**: Uppercase, Bold, Tracking Wider, 10px.

### Requirement: Breathing Animation Logic
- **Cycle**: 4 seconds (`duration-4000` or custom CSS).
- **Target**:
  - **Category Text**: Green (Always), Pulse when Unlocked.
  - **Note Text**: Green Pulse (Unlocked), Gray (Locked).

### Requirement: Data Persistence
- **Merge Logic**: `syncWithLedger` MUST merge `originalId` from parsed data into existing records.
- **Action**: User needs to re-import CSVs or we provide a migration script. Since we are in an IDE, I can write a script to patch the JSON if source CSVs are available, OR just rely on the user re-importing. *Wait, I can read the CSVs if they are in the project.*
- *Verification*: I will verify `LedgerService.syncWithLedger` logic again. It uses `...tData` which includes `originalId`. So re-importing SHOULD work.

## Tasks
1.  **Style Update**: DetailPage headers, Category/Note text colors & animations.
2.  **Animation**: Add custom 4s pulse class if needed.
3.  **Data Fix**: Verify merge logic via test or simulation.
