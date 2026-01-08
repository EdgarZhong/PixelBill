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

### 什么是 useMemo 及其在业务架构中的作用

**场景记录**
用户在审查代码时询问 `useMemo` 的具体含义及其在当前分层架构中的角色，特别是如何利用它来优化性能并充当逻辑层（Logic Layer）与视图层（View Layer）的连接器。

**知识总结**
`useMemo` 是 React 的“智能缓存计算器”，遵循 **“输入不变，结果不变”** 的原则。

1.  **核心机制**:
    ```typescript
    const result = useMemo(() => expensiveCalculation(a, b), [a, b]);
    ```
    只有当依赖项 `[a, b]` 发生变化（引用变更）时，才会重新执行 `expensiveCalculation`；否则直接返回上次缓存的结果。

2.  **在 PixelBill 中的战略地位**:
    在本项目中，`useMemo` 不仅仅是一个性能优化工具，它实际上**承载了业务逻辑层 (L3) 的核心生命周期**。
    *   **防波堤作用**: 原始账单 (`raw`) 和用户元数据 (`meta`) 是两个独立变化的数据源。`useMemo` 将它们合并，并调用昂贵的 `Arbiter` 仲裁逻辑。它确保了只有当数据真正变化时，才支付昂贵的 CPU 计算成本（正则匹配、插件轮询）。
    *   **视图层的数据源**: 对于 UI 组件（列表、图表）而言，它们不关心数据来自文件还是内存，它们只消费 `useMemo` 产出的 `Final Transactions`。这使得 UI 渲染逻辑与复杂的业务仲裁逻辑彻底解耦。

### useMemo 是什么？

用最通俗的话说，`useMemo` 是 React 组件里的**“智能缓存计算器”**。

#### 核心作用
它的任务是：**“只要输入没变，就直接给我上次算好的结果，别重新算。”**

在 React 中，只要组件的状态（State）发生任何变化（比如你切换了一个 Tab，或者鼠标悬停显示了一个提示框），整个组件函数就会**重新运行一遍**。如果没有 `useMemo`，所有的代码都会从头执行一次。

#### 语法结构
```typescript
const 缓存结果 = useMemo(() => {
  // 这里放昂贵的计算逻辑
  return 计算结果;
}, [依赖变量1, 依赖变量2]); // 只有当这些变量变了，才会重新计算
```

### 3. 在本项目 (pixel_bill) 中的关键作用

请看 [App.tsx](file:///d:/Code/VibeCodingWork/pixel_bill/src/App.tsx#L91-L160) 的第 91 行：

```typescript
// 合并逻辑: Raw + Meta -> Final Transactions
const transactions = useMemo(() => {
  // ... 这里有一个巨大的循环 ...
  return rawTransactions.map(t => {
     // 1. 在几千条数据中查找对应的元数据
     // 2. 运行 Arbiter 仲裁逻辑 (可能包含复杂的正则匹配)
     // 3. 生成最终对象
  });
}, [rawTransactions, ledgerMemory]); // <--- 依赖数组
```

#### 为什么要在这里用它？

在这个应用中，计算 `transactions` 是非常**昂贵**的：
1.  它要遍历所有的原始账单（可能有几千条）。
2.  每一条都要去 `ledgerMemory` 里查找有没有对应的记录。
3.  每一条都要跑一遍 `globalArbiter.decide`，这里面包含了正则匹配、插件调用等逻辑。

#### 如果没有 useMemo 会发生什么？

假设你点击了界面上的“只看餐饮 (MEAL)”按钮：
1.  `setFilter('MEAL')` 被调用，React 状态改变。
2.  App 组件重新渲染。
3.  **灾难发生**：如果没有 `useMemo`，CPU 会被迫再次遍历那几千条数据，再次跑一遍正则匹配……尽管原始数据 (`rawTransactions`) 和用户分类 (`ledgerMemory`) 根本没变！
4.  **用户体验**：你会感觉到点击按钮后有明显的**卡顿**。

#### 有了 useMemo 之后：

当你点击“只看餐饮”：
1.  App 组件重新渲染。
2.  `useMemo` 检查依赖：它发现 `rawTransactions` 没变，`ledgerMemory` 也没变。
3.  **瞬间返回**：它直接把**上一次**算好的那个数组给你。
4.  **用户体验**：界面切换如丝般顺滑。

### 总结
在 `pixel_bill` 中，`useMemo` 是连接**数据层**和**视图层**的防波堤。它确保了只有在数据源真正发生变化时，才消耗 CPU 去进行复杂的业务逻辑计算（仲裁），从而保护了 UI 的响应速度。


## 系统稳定性与状态同步

### 幂等性 (Idempotency) 与值收敛策略 (Value Convergence)

**场景记录**
在实现 `App.tsx` 中的“反向同步”逻辑（将 Arbiter 实时计算的分类结果写回 JSON 持久层）时，面临严重的**死循环风险**：
1.  Arbiter 计算新分类。
2.  Effect 发现不一致，触发 State 更新。
3.  State 更新导致组件重绘，再次触发 Arbiter 计算。
4.  Effect 再次运行……
如果不加控制，系统将陷入无限震荡。

**知识总结**

1.  **幂等性 (Idempotency)**:
    *   **定义**: “操作一次和操作多次，对系统状态产生的结果是相同的。” (f(x) = f(f(x)))。
    *   **生活类比**: 
        *   *非幂等*: 抽屉拉绳灯（拉一下亮，拉一下灭，状态随次数震荡）。
        *   *幂等*: 电梯楼层按钮（按一下去1楼，按一百下还是去1楼，状态最终稳定）。
    *   **架构价值**: 幂等性是消除副作用震荡的终极武器。在 React 的 `useEffect` 中，必须确保同步操作是幂等的。

2.  **值收敛策略 (Value Convergence)**:
    这是实现幂等性的具体技术手段。在本项目 [App.tsx](file:///d:/Code/VibeCodingWork/pixel_bill/src/App.tsx#L189) 中，我们实施了严格的“刹车”逻辑：
    ```typescript
    if (stored && stored.category !== tx.category) {
        // 核心防御：仅当逻辑值（Value）真正不一致时才触发更新
        updates[tx.id] = { ... };
        hasChanges = true;
    }
    ```
    *   **原理**: 虽然 React 的 State 更新通常基于引用（Reference）变化，但业务逻辑的同步必须基于**值（Value）**变化。
    *   **过程**: 
        *   第一轮循环：值不相等 -> 触发更新。
        *   第二轮循环：由于上一轮已更新，此时 `stored.value === calculated.value` -> 条件不成立 -> 停止更新。
    *   **结论**: 系统从“不稳定态”经过一次修正后，迅速回归“稳定态”。这种通过对比核心值来终止递归更新的方法，称为值收敛。

### 文件系统同步与回环检测 (Loopback Detection)

**场景记录**
在实现了“文件热重载”功能（当外部修改 JSON 时 App 自动刷新）后，我们遭遇了第二个致命的死循环——**IO 回环风暴**：
1.  **App 写入**: 用户在 App 操作 -> App 写入文件。
2.  **Watcher 触发**: 文件时间戳变更 -> `useFileWatcher` 触发重载。
3.  **App 重读**: App 重新读取文件 -> 更新 State。
4.  **App 重写**: State 更新触发副作用，再次写入文件（可能因微小的格式化差异）。
5.  **Watcher 再次触发** -> 死循环，导致编辑器卡死，系统 IO 飙升。

**知识总结**
在无法完全控制文件系统事件来源（无法区分是谁改的文件）的情况下，必须在应用层实施**回环检测机制**。

1.  **标记自身操作 (Self-Tagging)**:
    我们引入了一个 `lastSaveTimeRef` 变量。每当 App 成功执行写入操作时，记录当前时间戳：
    ```typescript
    await writeMemoryFile(...);
    lastSaveTimeRef.current = Date.now(); // 标记：这是我刚刚干的
    ```

2.  **回环抑制 (Loopback Suppression)**:
    在文件变更回调中，比对文件时间戳与最后一次写入时间。
    ```typescript
    const handleExternalFileChange = (file: File) => {
      const timeDiff = file.lastModified - lastSaveTimeRef.current;
      
      // 核心判据：如果文件变化发生在 App 写入后的极短时间内（如 2秒内）
      // 我们可以安全地认为这次变化是 App 自身写入引起的“回声”
      if (Math.abs(timeDiff) < 2000) {
        console.log('Ignored self-update loopback');
        return; // 直接忽略，切断循环
      }
      
      // 只有真正来自外部（如 VSCode）的修改才会通过
      reloadMetadata();
    };
    ```

3.  **结论**:
    在双向同步系统中，必须有一个机制来区分“外部输入”和“内部回声”。基于时间戳的“不应期（Refractory Period）”是一个简单而高效的解决方案。
