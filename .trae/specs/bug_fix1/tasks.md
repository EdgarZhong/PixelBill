# Tasks

- [x] Task 1: Data Structure & Parsing Update
  - [x] SubTask 1.1: Add `originalId` to `Transaction` interface in `src/types/metadata.ts`.
  - [x] SubTask 1.2: Update `src/utils/parser.ts` to populate `originalId` from `tradeNo`.
  - [x] SubTask 1.3: Verify parsing logic with new CSV import (optional test).

- [x] Task 2: Service Logic Refinement
  - [x] SubTask 2.1: Modify `LedgerService.ts` -> `setVerification`:
    - Logic: ONLY toggle `is_verified` boolean.
    - REMOVE logic that clears `user_category` on unlock.
  - [x] SubTask 2.2: Verify `useAppLogic` exposes correct method.

- [x] Task 3: Category Selector Fixes
  - [x] SubTask 3.1: Refactor `CategorySelector.tsx`:
    - **Fix Deadlock**: Ensure Overlay unmounts correctly (check `AnimatePresence` and `Portal` usage).
    - **Fix Style**: Remove CRT effects, apply "Clean Modern Pixel" style (Solid bg, 1px border).
    - **Fix Animation**: Replace Spring with Ease.
    - **Fix Logic**: "Save on Close" only.

- [x] Task 4: Vertical Picker Stabilization
  - [x] SubTask 4.1: Refactor `VerticalCategoryPicker.tsx`:
    - **Fix Jitter**: Decouple scroll event from selection state update (prevent feedback loop).
    - **Optimize Snap**: Ensure smooth snapping to center without re-triggering scroll.

- [x] Task 5: Note Editor Fixes
  - [x] SubTask 5.1: Refactor `NoteEditor.tsx`:
    - **Fix Deadlock**: Ensure Overlay unmounts correctly.
    - **Fix Style**: Match CategorySelector's new modern style.
    - **Fix Animation**: Replace Spring with Ease.
    - **Fix Logic**: "Save on Close" only.

- [x] Task 6: UI Integration & Verification
  - [x] SubTask 6.1: Update `DetailPage.tsx` to display `originalId`.
  - [x] SubTask 6.2: Verify full flow:
    - Unlock -> Edit -> Close -> Re-open (Check data).
    - Lock -> Edit Disabled.
    - Unlock -> Data remains.
