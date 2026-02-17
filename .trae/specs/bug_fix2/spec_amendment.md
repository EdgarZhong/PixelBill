# Critical Bug Fix: Restore Lock UI & Disable Auto-Lock

## Why
在上一轮重构中，`CategorySelector` 组件意外丢失了“锁定”按钮的 UI 代码，导致用户无法手动切换锁定状态。同时，`Arbiter.ts` 中存在隐式的“修改即锁定”逻辑，导致用户修改分类后 `is_verified` 被强制置为 `true`，违反了新的交互规格。

## What Changes
- **Restore UI**: 在 `CategorySelector` 中恢复锁定按钮，位于触发器左侧，与 Spec 一致。
- **Disable Auto-Lock**: 修改 `Arbiter.ts` 中的 `dispatchPersistence` 逻辑，**彻底移除** `is_verified: !isClearing` 的隐式赋值。
- **Explicit Locking**: 确保只有显式调用 `toggleVerification` 时才改变锁定状态。

## Impact
- **Affected Specs**: `bug_fix2` (Amendment)
- **Affected Code**:
  - `src/components/mobile/CategorySelector.tsx` (Restore UI)
  - `src/core/arbiter/Arbiter.ts` (Logic Fix)

## MODIFIED Requirements

### Requirement: Manual Lock UI
`CategorySelector` 必须包含一个显式的锁定/解锁按钮：
- **Position**: Left of the category trigger.
- **Style**: 
  - Unlocked: `border-white/50 text-pixel-green`.
  - Locked: `border-gray-800 text-gray-400`.
- **Interaction**: Click toggles `isLocked` state via `onToggleLock` prop.

### Requirement: No Implicit Verification
`Arbiter` 在处理 `USER` 来源的 Proposal 时：
- **MUST NOT** automatically set `is_verified` to `true`.
- **MUST** preserve the current `is_verified` state (or let it be handled by a separate action).
- *Correction*: `Arbiter` generates a patch. If `is_verified` is not in the patch, `LedgerService` merges it with existing record. So we just omit `is_verified` from the update object in `Arbiter`.

## Verification Plan
1.  **UI Check**: Verify Lock button reappears in `CategorySelector`.
2.  **Logic Check**:
    - Unlock an item.
    - Change category.
    - Check if `is_verified` remains `false`.
    - Click Lock button.
    - Check if `is_verified` becomes `true`.
