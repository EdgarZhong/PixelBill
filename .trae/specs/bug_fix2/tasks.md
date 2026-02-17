# Tasks

- [x] Task 1: Logic Fixes
  - [x] SubTask 1.1: Fix `MobileApp.tsx`: `onUpdate` logic MUST NOT set `is_verified: true` when updating category/note.
  - [x] SubTask 1.2: Verify `originalId` passing chain (Parser -> App -> DetailPage).

- [x] Task 2: Category Selector Style & Logic
  - [x] SubTask 2.1: Refactor `CategorySelector.tsx`:
    - Apply `DateRangePicker` panel styles (border, shadow, backdrop).
    - Fix Trigger style: `border-white/50`, `text-pixel-green` (breathing).
    - Fix Initial State: Ensure `tempCategory` is set and carousel scrolls to it immediately on open.
  - [x] SubTask 2.2: Refactor `VerticalCategoryPicker.tsx`:
    - Use `font-pixel` (Press Start 2P).
    - Remove bottom indicator.
    - Match active/inactive scale and opacity of Main Tabs.

- [x] Task 3: Note Editor Style
  - [x] SubTask 3.1: Refactor `NoteEditor.tsx`:
    - Apply `DateRangePicker` panel styles.
    - Increase height (`h-48`).
    - Move Close/Save action to Bottom-Right.

- [x] Task 4: Detail Page Polish
  - [x] SubTask 4.1: Update `DetailPage.tsx`:
    - Add `bg-dot-matrix` to background.
    - Reduce card border radius to `rounded-sm`.
    - Ensure `originalId` is displayed.

# Task Dependencies
- Task 2 and 3 depend on Task 1 (partially).
