# Tasks (Amendment)

- [x] Task A1: Restore Lock Button in `CategorySelector.tsx`
  - [x] SubTask A1.1: Add Lock/Unlock icon button back to the left of the trigger.
  - [x] SubTask A1.2: Ensure it calls `onToggleLock`.
  - [x] SubTask A1.3: Apply correct styles (Pixel Green/White vs Gray).

- [x] Task A2: Disable Auto-Lock in `Arbiter.ts`
  - [x] SubTask A2.1: In `dispatchPersistence`, remove `is_verified` property from the `updates` object when source is `USER`.

- [x] Task A3: Verification
  - [x] SubTask A3.1: Verify "Edit -> No Lock" flow.
  - [x] SubTask A3.2: Verify "Click Lock -> Lock" flow.
