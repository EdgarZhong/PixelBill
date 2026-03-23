# Default 账本分类结构兼容修复 Spec

## Why
阶段 A 完成后，首次打开界面出现 default 账本“全部未分类”与标签轮盘显示 `0~9` 的回归。根因是旧账本 `defined_categories` 仍为数组结构，而当前读取链路按映射结构处理，导致标签键名与分类合法性校验失真。

## What Changes
- 在账本加载入口增加 `defined_categories` 结构兼容归一化（数组 → 映射），并保证内存态始终为映射。
- 在分类合法性校验前增加防御性标准化，避免数组键名被误当作分类名。
- 在标签生成路径增加输入约束，确保 UI 永远基于语义分类名渲染，不出现数字索引标签。
- 增加一次性持久化回写策略：仅当检测到旧结构时执行，避免重复写盘。
- 补充调试与回归验证路径，覆盖“启动加载 + 切账本加载 + 按钮触发链路”。
- 不修改触发策略，不新增前端交互流程，不接管自动触发。

## Impact
- Affected specs: P2 阶段 A（Per-Ledger Queue Core）后的账本兼容读取、分类展示一致性、UI 按钮触发链路稳定性
- Affected code: `src/core/services/LedgerService.ts`、`src/core/services/LedgerManager.ts`、`src/utils/fs-storage.ts`、`src/views/MobileApp.tsx`（只读验证）

## ADDED Requirements
### Requirement: 账本加载结构归一化
系统 SHALL 在任何账本加载进入业务态前，将 `defined_categories` 归一化为 `Record<string, string>`。

#### Scenario: 启动加载旧账本成功
- **WHEN** 应用启动并加载一个 `defined_categories` 为数组的旧账本
- **THEN** 内存中的 `defined_categories` 被转换为映射结构
- **AND** 标签列表显示语义分类名而非数字索引
- **AND** 不会将原有合法分类误判为 `uncategorized`

#### Scenario: 切换到账本时兼容生效
- **WHEN** 用户切换到任一旧结构账本
- **THEN** 同样执行归一化并保持行为与启动加载一致

### Requirement: 一次性迁移回写
系统 SHALL 仅在检测到旧结构时执行一次持久化回写，后续加载不重复迁移。

#### Scenario: 首次迁移后再次加载
- **WHEN** 同一账本已完成结构迁移并重新加载
- **THEN** 系统不再重复触发迁移写入
- **AND** 分类与标签表现保持稳定一致

## MODIFIED Requirements
### Requirement: 分类合法性判定
系统 SHALL 基于归一化后的分类映射键集合进行合法性校验，不得直接对数组结构执行键提取并参与判定。

## REMOVED Requirements
### Requirement: 无
**Reason**: 本次为兼容修复与行为收敛，不移除既有能力。
**Migration**: 无。
