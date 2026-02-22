# Tasks

- [x] Task 1: Refactor LedgerSwitcher to Self-Contained Component
    - [x] SubTask 1.1: Define `LedgerSwitcherProps` to include `isLoading` and other necessary props from Header.
    - [x] SubTask 1.2: Implement internal `isOpen` state (or accept controlled state but manage trigger rendering).
    - [x] SubTask 1.3: Structure the component to render `Trigger` when closed and `Modal` (via Portal) when open.
    - [x] SubTask 1.4: Apply `layoutId="ledger-switcher-container"` to both Trigger container and Modal container.
    - [x] SubTask 1.5: Apply `layoutId="ledger-switcher-label"` to the `[CHOOSE_LEDGER]` text in both states.

- [x] Task 2: Integrate LedgerSwitcher into Header
    - [x] SubTask 2.1: Update `Header.tsx` to import and use `<LedgerSwitcher />` instead of the raw `<button>`.
    - [x] SubTask 2.2: Pass necessary props (`ledgers`, `activeLedger`, `onSwitch`, etc.) from `Header` props to `LedgerSwitcher`.

- [x] Task 3: Update MobileApp Data Flow
    - [x] SubTask 3.1: Pass `ledgers`, `activeLedger`, `onSwitch`, `onCreate`, `onDelete` to `Header` component.
    - [x] SubTask 3.2: Remove the standalone `<LedgerSwitcher />` from `MobileApp.tsx` return statement.
    - [x] SubTask 3.3: Remove `isLedgerSwitcherOpen` state from `MobileApp` (if no longer needed by other logic) or simplify `handleChooseLedger` to just trigger data loading.

- [x] Task 4: Verify and Polish Animation
    - [x] SubTask 4.1: Ensure `AnimatePresence` correctly handles the exit animation (Trigger reappearing after Modal disappears).
    - [x] SubTask 4.2: Verify z-index and stacking context to ensure the expanding element is always on top.
    - [x] SubTask 4.3: Match the animation curve (spring/tween) with `DateRangePicker`.
