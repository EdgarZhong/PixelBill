# Refactoring Plan: Core Loop & Data Flow (Phase 2)

本实施文档基于 `docs/DESIGN.md` (v2026-01-31) 制定，旨在重构系统的核心数据流、仲裁机制及持久化通路。

## 目标 (Goals)
1.  **Arbiter 纯净化**: 移除 `Arbiter` 中对 `transaction.ai_category` 等字段的直接硬编码依赖，转为基于 `ProposalCache` 的单一来源调度。
2.  **数据流分流 (Dispatch)**: 实现精确的持久化分流，确保 `USER` 和 `AI_AGENT` 的修改只写入各自的字段。
3.  **循环解耦**: 明确分离高频渲染循环、事件驱动仲裁循环和低频 I/O 写入循环。
4.  **移除过时逻辑**: 删除所有关于“置信度 (Confidence)”和“正则规则 (Regex Rule)”的代码路径。

---

## 实施步骤 (Implementation Steps)

### Step 1: 基础设施准备 (Infrastructure)

#### 1.1 升级 `Proposal` 定义
*   **文件**: `src/core/plugin/types.ts`
*   **任务**:
    *   移除 `confidence` 字段。
    *   确保 `reasoning` 字段为必填（或默认为空字符串）。

#### 1.2 重构 `ProposalCache` 结构
*   **文件**: `src/core/arbiter/Arbiter.ts` (内部状态)
*   **任务**:
    *   定义新的 Cache 结构：
        ```typescript
        type ProposalCache = {
          [txId: string]: {
            USER?: Proposal;
            AI_AGENT?: Proposal;
          }
        };
        ```
    *   移除 `RULE_ENGINE` 相关缓存槽位。

### Step 2: 改造 Arbiter (The Core)

#### 2.1 实现 `ingest` 方法 (Proposal 入口)
*   **文件**: `src/core/arbiter/Arbiter.ts`
*   **逻辑**:
    *   接收 `Proposal`。
    *   更新 `ProposalCache`。
    *   **立即**调用 `decide(txId)` 计算新状态。
    *   **异步**调用 `generatePatch(proposal)` 并发送给 Writer（如果需要持久化）。

#### 2.2 重写 `decide` 方法 (纯仲裁)
*   **文件**: `src/core/arbiter/Arbiter.ts`
*   **逻辑**:
    *   仅从 `ProposalCache` 读取数据。
    *   **优先级逻辑**:
        1.  `USER` 存在 -> 返回 `USER.category`。
        2.  `AI_AGENT` 存在 -> 返回 `AI_AGENT.category`。
        3.  Fallback -> 返回 `Uncategorized`。
    *   移除所有置信度比较逻辑。

#### 2.3 实现 `generatePatch` (分流器)
*   **文件**: `src/core/arbiter/Arbiter.ts`
*   **逻辑**:
    *   Input: `Proposal`
    *   Output: `PersistencePatch { id, updates: { ... } }`
    *   根据 Source 映射到 `user_*` 或 `ai_*` 字段。

### Step 3: 改造数据源插件 (Plugins)

#### 3.1 改造 `UserMetaPlugin` (或对应 UI 处理逻辑)
*   **位置**: UI 组件或 Hook (`useAppLogic.ts` / `TransactionDetail.tsx`)
*   **任务**:
    *   用户操作不再直接修改 `transaction` 对象。
    *   用户操作转化为 `Arbiter.ingest({ source: 'USER', ... })` 调用。
    *   处理 `is_verified` 的隐式/显式逻辑。

#### 3.2 改造 `LocalAIMetaPlugin` (Watcher 适配)
*   **文件**: `src/core/plugin/LocalAIMetaPlugin.ts`
*   **任务**:
    *   确保插件**被动**响应数据加载/更新。
    *   当 `LedgerLoader` 读入新数据时，插件应扫描 `ai_category` 字段，并将其转化为 `Proposal(Source=AI)` 注入 Arbiter（初始化阶段）。
    *   *注*: 运行时 Watcher 触发的热重载也会走这个初始化/更新流程。

### Step 4: 持久化层 (Persistence Layer)

#### 4.1 升级 `DebouncedWriter` (或 `useFileSystem`)
*   **文件**: `src/hooks/useFileSystem.ts` (需确认具体写入位置)
*   **任务**:
    *   使其支持接收 `PersistencePatch`。
    *   实现“读取 -> Patch -> 写入”的原子操作（或利用内存中最新的 Transaction 对象进行合并）。
    *   确保写入后暂停 Watcher 一段时间（Debounce）。

### Step 5: 验证与清理 (Verification & Cleanup)

*   **测试用例**:
    1.  **用户覆盖 AI**: AI 已有分类 -> 用户修改分类 -> UI 显示用户分类 -> JSON 中 `user_category` 更新，`ai_category` 不变。
    2.  **AI 补充**: 用户无分类 -> AI 注入分类 -> UI 显示 AI 分类 -> JSON 中 `ai_category` 更新。
    3.  **锁定机制**: 用户 Verify -> 再次注入 AI 结果 -> UI 保持不变（因为 USER 优先级高，且 AI 不写 USER 字段）。
*   **代码清理**: 搜索并删除所有 `confidence` 引用和 Regex Rule 相关代码。

---

## 风险控制 (Risk Control)
*   **数据丢失**: 在 Writer 改造期间，确保 `patch` 逻辑覆盖所有字段，防止丢失未修改的字段（应使用 `...prev, ...updates`）。
*   **死循环**: 重点测试 Watcher -> Load -> Arbiter -> Writer -> FileChange -> Watcher 链路，确保 Writer 的 Debounce 有效。
