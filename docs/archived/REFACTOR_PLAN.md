# Refactoring Plan: Core Loop & Data Flow (Phase 2) - V2

本实施文档严格遵循 `docs/DESIGN.md` (v2026-01-31) 架构定义，修正了前版计划中关于“删除规则引擎”的架构性偏差，并补充了远程 AI 插件的集成路径。

## 目标 (Goals)
1.  **Arbiter 纯净化**: 移除 `Arbiter` 中对 `transaction.ai_category` 等字段的直接硬编码依赖，转为基于 `ProposalCache` 的单一来源调度。
2.  **数据流分流 (Dispatch)**: 实现精确的持久化分流，确保 `USER` 和 `AI_AGENT` 的修改只写入各自的字段。
3.  **架构完整性**: 保留 `RULE_ENGINE` 的架构槽位（即使当前版本暂不启用），严格遵守 `User > Rule > AI` 的优先级定义。
4.  **循环解耦**: 明确分离高频渲染循环、事件驱动仲裁循环和低频 I/O 写入循环。

---

## 实施步骤 (Implementation Steps)

### Step 1: 基础设施准备 (Infrastructure)

#### 1.1 升级 `Proposal` 定义
*   **文件**: `src/core/plugin/types.ts`
*   **任务**:
    *   移除 `confidence` 字段 (Design 5.3.B)。
    *   确保 `reasoning` 字段为必填（或默认为空字符串）。
    *   **保留** `RULE_ENGINE` 在 `ProposalSource` 中的定义。

#### 1.2 重构 `ProposalCache` 结构
*   **文件**: `src/core/arbiter/Arbiter.ts` (内部状态)
*   **任务**:
    *   定义新的 Cache 结构，保留 RULE 槽位：
        ```typescript
        type ProposalCache = {
          [txId: string]: {
            USER?: Proposal;
            RULE?: Proposal;     // 保留槽位 (Architectural Placeholder)
            AI_AGENT?: Proposal;
          }
        };
        ```

### Step 2: 改造 Arbiter (The Core)

#### 2.1 实现 `ingest` 方法 (Proposal 入口)
*   **文件**: `src/core/arbiter/Arbiter.ts`
*   **逻辑**:
    *   接收 `Proposal`。
    *   **时序保护 (Timestamp Guard)**:
        *   读取 Cache 中该 Source 的现有 Proposal。
        *   若 `existingProposal` 存在且 `newProposal.timestamp < existingProposal.timestamp`，则**丢弃**新提案（防止本地旧文件回读覆盖内存中的远程新结果）。
    *   更新 `ProposalCache` (若通过检查)。
    *   **立即**调用 `decide(txId)` 计算新状态。
    *   **异步**调用 `generatePatch(proposal)` 并发送给 Writer（如果需要持久化）。

#### 2.2 重写 `decide` 方法 (纯仲裁)
*   **文件**: `src/core/arbiter/Arbiter.ts`
*   **逻辑**:
    *   严格遵循 `User > Rule > AI` 优先级 (Design 4.6.A)：
        1.  `USER` 存在 -> 返回 `USER.category`。
        2.  `RULE` 存在 -> 返回 `RULE.category` (即使当前无插件产生此 Proposal，逻辑上必须存在)。
        3.  `AI_AGENT` 存在 -> 返回 `AI_AGENT.category`。
        4.  Fallback -> 返回 `Uncategorized`。
    *   移除所有置信度比较逻辑。

#### 2.3 实现 `generatePatch` (分流器)
*   **文件**: `src/core/arbiter/Arbiter.ts`
*   **逻辑**:
    *   Input: `Proposal`
    *   Output: `PersistencePatch { id, updates: { ... } }`
    *   **Dispatch Logic** (Design 5.3.C):
        *   `Source === USER`: 写入 `user_category`, `user_note`, `is_verified: true`。
        *   `Source === AI_AGENT`: 写入 `ai_category`, `ai_reasoning`。
        *   `Source === RULE`: (当前版本暂不持久化或仅用于运行时，视需求而定，暂留空)。

### Step 3: 改造数据源插件 (Plugins)

#### 3.1 改造 `UserMetaPlugin` (UI 交互层)
*   **位置**: `useAppLogic.ts` / `TransactionDetail.tsx`
*   **任务**:
    *   用户操作不再直接修改 Transaction 对象。
    *   转化为 `Arbiter.ingest({ source: 'USER', ... })` 调用。

#### 3.2 改造 `LocalAIMetaPlugin` (Watcher/Loader 适配)
*   **文件**: `src/core/plugin/LocalAIMetaPlugin.ts`
*   **任务**:
    *   **状态维护**: 维护 `lastKnownHash` (Content Hash) 以识别文件是否真的发生了变更。
    *   **策略分流**:
        *   **Desktop**: 保持 `FileWatch` 监听 (Polling)，实时响应外部修改。
        *   **Mobile**: **移除** `setInterval` 轮询。仅暴露 `checkUpdates()` 方法，绑定到 App `resume` 事件。
    *   **执行逻辑 (Check Logic)**:
        1.  读取文件内容。
        2.  计算 `currentHash`。
        3.  **Hash Guard**: 若 `currentHash === lastKnownHash`，**直接返回** (静默退出)，绝不生成 Proposal。这能完美防止 App 切回前台时，因读取未变更的旧文件而覆盖内存中最新的 Remote AI 结果。
        4.  若 Hash 变更：
            *   更新 `lastKnownHash`。
            *   **提取时间戳**: 必须使用 `File.mtime` (文件最后修改时间) 作为 Proposal 的 timestamp。
            *   转化为 `Proposal(source: 'AI_AGENT')` 注入 Arbiter。

#### 3.4 启动一致性检查 (Consistency Check)
*   **文件**: `src/hooks/useAppLogic.ts`
*   **任务**:
    *   在 `syncWithLedger` 或 `hydrate` 完成后，执行一次全量检查。
    *   **逻辑**: 
        ```typescript
        // Pseudo Code
        transactions.forEach(tx => {
            const memoryCat = ledgerMemory.records[tx.id]?.category;
            const arbiterCat = globalArbiter.decide(tx.id).category;
            if (memoryCat !== arbiterCat) {
                // 触发回写
                globalArbiter.ingest(tx.id, arbiter.getBestProposal(tx.id)); 
            }
        });
        ```
    *   利用 Writer 的防抖特性合并写入。

#### 3.3 新增 `AIPlugin` (Remote AI, Day 3 Goal)
*   **文件**: `src/core/plugin/AIPlugin.ts`
*   **任务**:
    *   对接 LLM API。
    *   解析返回结果。
    *   **生成时间戳**: 使用 `Date.now()` 作为 Proposal 的 timestamp。
    *   转化为 `Proposal(source: 'AI_AGENT')` 注入 Arbiter。
    *   *注意*: `LocalAIMetaPlugin` 和 `AIPlugin` 均产生 `AI_AGENT` 类型的提案，Arbiter 仅存储最新的一个（Last Write Wins）。

### Step 4: 持久化层 (Persistence Layer)

#### 4.1 实现 `PersistenceManager` (Singleton Class)
*   **文件**: `src/core/services/PersistenceManager.ts`
*   **任务**:
    *   **架构**: 采用单例模式，脱离 React 生命周期，确保 I/O 任务的稳定性。
    *   **接口**: `scheduleWrite(handle: StorageHandle, data: LedgerMemory)`。
    *   **防抖策略**: `1000ms` 无操作后触发写入。
    *   **状态管理**: 使用 `pendingData` 存储待写入快照，新请求覆盖旧请求 (Last Write Wins)。
    *   **执行逻辑**:
        1.  接收最新的 `LedgerMemory` 全量数据。
        2.  在 `flush()` 中调用 `fs-storage` 提供的 `writeFile` 接口。
        3.  错误处理：写入失败时保留 `pendingData` 以备重试。

### Step 5: 验证与清理 (Verification & Test Plan)

#### 5.1 单元测试方案 (Unit Logic Test)
*   **Arbiter 优先级测试**:
    *   `Cache = { USER: 'A', AI: 'B' }` -> Expect Decision: 'A'
    *   `Cache = { USER: '', AI: 'B' }` -> Expect Decision: 'B'
    *   `Cache = { AI: 'B' }` -> Expect Decision: 'B'
*   **Timestamp Guard 测试**:
    *   Action: Ingest AI Proposal (Cat='New', T=200) -> State: 'New'
    *   Action: Ingest AI Proposal (Cat='Old', T=100) -> State: 'New' (Reject Old)
    *   Action: Ingest User Proposal (Cat='User', T=150) -> State: 'User' (User Priority overrides Timestamp of AI)
*   **Persistence Dispatch 测试**:
    *   Input: User Proposal -> Output Patch: `{ user_category: ..., is_verified: true }`
    *   Input: AI Proposal -> Output Patch: `{ ai_category: ... }` (No user fields touched)

#### 5.2 集成测试方案 (Manual Integration)
1.  **UI 交互验证**:
    *   操作: 在 UI 中修改某笔交易分类为 "Food"。
    *   验证:
        *   UI 立即更新。
        *   约 1s 后，JSON 文件更新，该记录 `user_category` = "Food"。
        *   若原记录有 `user_note`，验证是否按规则同步（清空或保留）。
2.  **文件热重载验证 (File Sync)**:
    *   操作: 保持 App 运行，用外部编辑器修改 JSON，给某条无分类记录添加 `"ai_category": "TestAI", "updated_at": "2026-01-01..."`。
    *   验证: App 自动检测变更，UI 显示 "TestAI"。
3.  **后台冲突模拟 (Background Conflict)**:
    *   场景: App 处于前台，内存中有 Remote AI 结果 (T=Now)。
    *   操作: 模拟 App 切后台再切回 (触发 Resume/Watch)，文件系统中有旧的 AI 结果 (T=Old)。
    *   验证: Arbiter 拒绝文件系统的旧 Proposal，保留内存中的新结果。

#### 5.3 代码清理
*   `useAppLogic.ts`: 移除所有错误的 `globalArbiter.ingest(parsedData)` 调用，修复批量导入时的潜在崩溃风险。
*   `Arbiter.ts`: 优化 `hydrate` 方法，正确读取 `meta.updated_at` 作为 Proposal 时间戳。

---

## 修正说明 (Corrections from V1)
*   **恢复 Rule Engine**: 修正了 V1 中“删除 Rule Engine”的错误，改为“保留架构槽位但暂不激活”，符合 Design 4.6.A 定义。
*   **明确 Remote AI**: 补充了 Step 3.3，明确了 Day 3 的 Remote AI 插件如何接入数据流。
