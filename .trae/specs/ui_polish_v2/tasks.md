# Tasks

- [x] Task 1: UI Unification
  - [x] SubTask 1.1: Update `DetailPage.tsx`:
    - Unified Header Style (Height & Color: Grayscale/Dark Green).
    - Standardized Font Sizes.
  - [x] SubTask 1.2: Refactor `CategorySelector.tsx`:
    - Implement Green Solid (Locked) vs Green Breathing (Unlocked).
    - Cycle: 4s.
  - [x] SubTask 1.3: Refactor `NoteEditor.tsx`:
    - Implement Gray (Locked) vs Green Breathing (Unlocked).
    - Cycle: 4s.

- [x] Task 2: Data Merge Verification
  - [x] SubTask 2.1: Verify `LedgerService.ts` merge logic (Code Review/Test).
  - [x] SubTask 2.2: (Optional) Create a script to patch `default.pixelbill.json` with dummy `originalId` for testing visibility, OR rely on re-import. *Decision: I will modify the JSON directly for the current view to verify UI.*

- [x] Task 3: Original ID Visibility
  - [x] SubTask 3.1: Ensure `DetailPage.tsx` renders `originalId` correctly.
