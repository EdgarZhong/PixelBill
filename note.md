# 现代前端架构笔记

## TypeScript 语言知识

### 为什么 readonly 属性可以在对象重建时被重新赋值

**场景记录**
在开发 `pixel_bill` 项目的元数据合并逻辑时，用户发现 `Transaction` 接口中的 `category` 字段被定义为 `readonly`。然而，在 `App.tsx` 的合并逻辑中，代码通过对象展开（Spread Syntax）创建新对象并覆盖了 `category` 属性，这看似违反了只读约束，但编译器并未报错。用户对此感到困惑，质疑这是否符合语法规则。

**知识总结**
在 TypeScript 中，`readonly` 关键字的约束作用域严格限制在**对象创建之后**。它禁止的是对**已存在实例**的属性进行再赋值（Mutation），但不禁止在**新实例初始化**时定义该属性。

*   **非法操作（Mutation）**：试图修改已存在对象的属性。
    ```typescript
    const tx: Transaction = ...;
    tx.category = 'food'; // ❌ 报错：Cannot assign to 'category'...
    ```
*   **合法操作（Reconstruction）**：在对象字面量初始化时定义属性值。
    ```typescript
    // ✅ 合法：我们在创建一个全新的对象 newTx，并在其“出生”瞬间赋予它 category 值
    const newTx = { ...oldTx, category: 'food' };
    ```
本质上，我们并没有“修改”旧对象，而是“制造”了一个带有新属性值的新对象。一旦新对象创建完成，其属性依然受 `readonly` 保护。

## React 框架知识

### 为什么采用重建对象（Immutable）而不是原地修改（Mutable）

**场景记录**
在讨论元数据更新机制时，用户提出质疑：既然要修改 `category`，直接解除 `readonly` 限制并原地修改对象的属性似乎更直观且性能更高（避免了对象创建开销）。用户询问选择“重建对象”是否涉及 React 和 TypeScript 的深层设计理念。

**知识总结**
选择 Immutable（不可变）而非 Mutable（可变）主要基于以下三个核心考量：

1.  **React 的渲染机制 (Shallow Comparison)**：
    React 判断组件是否更新依赖极速的**引用对比**（指针检查）。
    *   **原地修改**：`oldObj === oldObj` 为 `true`，React 认为数据未变，**拒绝刷新 UI**。
    *   **重建对象**：`oldObj === newObj` 为 `false`，React 立即感知变化并更新。
    如果要支持原地修改，React 必须进行昂贵的深比较（Deep Compare），这将导致 O(N) 的性能灾难。

2.  **数据流的可预测性**：
    可变数据会导致“幽灵副作用”——任何持有引用的组件都可能悄悄修改数据。Immutable 配合 TypeScript 的 `readonly` 强制所有修改必须通过单一的数据流入口（如 State 更新函数）生成新数据，确保数据流清晰、可追溯。

### 如何解决 Immutable 带来的全量重建性能浪费

**场景记录**
用户敏锐地指出，如果严格遵守 Immutable 原则，每次修改元数据都触发全量 `Transaction` 对象的重建，在数据量较大（如数千条交易）时将是巨大的性能浪费（GC 压力大）。这促使我们思考如何在坚持 Immutable 原则的同时优化性能。

**知识总结**
为了平衡 Immutable 的安全性与性能，我们采用了 **结构共享 (Structural Sharing)** 和 **细粒度引用缓存 (Memoization)** 策略：

在 `App.tsx` 中引入 `transactionCacheRef`：
1.  **极速路径**：在遍历合并时，检查 `Raw Data`（原始数据）和 `Meta Data`（元数据）的引用是否变化。
2.  **复用旧值**：如果两者引用均未变，直接返回缓存中的旧对象引用。
3.  **按需重建**：只有当某条记录真正发生变化时，才为该记录创建新对象。

通过这种方式，即使修改了一条元数据，系统也只会重建那**唯一一个**受影响的对象，其余 99.9% 的对象保持引用不变。这既满足了 React 的浅比较更新需求，又将计算和内存开销降到了最低。

### 如何利用 React 响应流实现 Pull 架构的“隐式轮询”

**场景记录**
在设计 `pixel_bill` 的元数据仲裁系统时，面临一个架构矛盾：
*   **Arbiter (仲裁器)** 采用 **Pull (轮询)** 模式，主动询问插件意见。
*   **User Action (用户操作)** 是 **Push (事件)** 模式，用户修改数据是离散事件。
用户质疑：在轮询架构下，如何确保用户修改元数据后，UserMetaPlugin 能立刻被触发？

**解决方案**
巧妙利用 **React 的 Immutable State + useMemo** 机制，将“状态变更”作为隐式触发器，实现了 Push 到 Pull 的自然转换，无需额外的事件总线。

1.  **数据流转**:
    *   用户操作 -> `setState` 更新 `ledgerMemory` (State Change)。
    *   React 检测到依赖变化 -> 触发 `useMemo` 重算。
    *   `useMemo` 内部调用 `arbiter.decide(tx)`。
    *   `arbiter` 顺势轮询 `UserMetaPlugin`。
    *   `UserMetaPlugin` 读取最新的 `tx` (携带了新 meta)，返回提案。

2.  **核心价值**:
    *   **架构统一**: 保持了 Arbiter 纯粹的 Pull 接口设计，无需为 User 插件开后门。
    *   **数据一致性**: 只要 React State 是最新的，Arbiter 看到的永远是最新的数据，避免了时序同步问题。
    *   **开发简便**: 复用了 React 现有的渲染循环，零额外成本。
