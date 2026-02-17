# Tasks

- [x] Task 1: Component Style Refinement
  - [x] SubTask 1.1: Refactor `CategorySelector.tsx`:
    - Remove `animate-pulse` from trigger.
    - Fix Lock button background color to match card (`bg-transparent` or inherit).
  - [x] SubTask 1.2: Refactor `NoteEditor.tsx`:
    - Remove `animate-pulse` from trigger.
    - Update Save button in panel (Remove circle bg, keep icon).

- [x] Task 2: Detail Page Layout Restructuring
  - [x] SubTask 2.1: Create "USER EDIT" Card (merged Category + Note).
    - Use Dark Blue Header style (match AI Diagnosis).
    - Insert `CategorySelector` and `NoteEditor`.
  - [x] SubTask 2.2: Update all other cards to use English Titles (`AMOUNT`, `TIME`, `PRODUCT`, etc.).
  - [x] SubTask 2.3: Standardize font sizes (Title 10px, Body xs/sm).

- [x] Task 3: AI Label Logic Update
  - [x] SubTask 3.1: Change AI Label color to Yellow.
  - [x] SubTask 3.2: Implement "Dim if overridden" logic.

- [x] Task 4: Original ID Verification
  - [x] SubTask 4.1: Ensure `ORIGINAL_ID` is displayed with correct label and style.
