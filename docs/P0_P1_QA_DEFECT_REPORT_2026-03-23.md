# PixelBill P0/P1 阶段缺陷检测报告

**日期**: 2026-03-23  
**测试角色**: 测试工程师（本会话联合验证）  
**范围**: AI 自学习 P0（实例库）+ P1（记忆文件/学习会话/快照/自述）  
**测试方式**: 静态检查 + 控制台脚本 + 端到端 UI 实测

---

## 1. 总体结论

- P0 核心功能：通过（PASS）
- P1 核心功能：通过（PASS），但存在若干 UI/规格一致性问题
- 本会话共识别缺陷/问题项：7 项
  - 已修复：1 项
  - 待修复：6 项

---

## 2. 测试执行摘要

### 2.1 已通过验证

- `checkAIData('default')`：当前已稳定返回状态对象，无首次读取红色报错。
- `runP0Test()`：实例库新增/检索/清理流程通过。
- `runP1Test()`：记忆读写、增量更新、快照创建、自述读写、ConfigManager 兼容读取通过。
- UI 手工链路：可进入设置页、AI_MEMORY 面板、历史快照可打开、回退可执行、当前快照高亮可跟随。

### 2.2 本会话修复项概览

- 已修复 QAF-001（首次读取文件导致红色报错）：
  - [MemoryManager.ts](file:///d:/Code/VibeCodingWork/pixel_bill/src/core/services/MemoryManager.ts#L52-L68)
  - [ExampleStore.ts](file:///d:/Code/VibeCodingWork/pixel_bill/src/core/services/ExampleStore.ts#L80-L120)
  - [SelfDescriptionManager.ts](file:///d:/Code/VibeCodingWork/pixel_bill/src/core/services/SelfDescriptionManager.ts#L24-L36)
  - [SnapshotManager.ts](file:///d:/Code/VibeCodingWork/pixel_bill/src/core/services/SnapshotManager.ts#L76-L90)

---

## 3. 缺陷明细

### QAF-001 首次基础检查出现红色文件读取报错（已修复）

- **严重级**: Medium  
- **状态**: ✅ 已修复  
- **发现阶段**: 控制台基础确认（`checkAIData`）
- **复现步骤**:
  1. 首次运行 `await window.__DEBUG_TOOLS__.checkAIData('default')`
  2. 控制台出现 `POST /api/fs 404` 与 `File not found` 红色报错
- **预期结果**:
  - 首次无数据应返回 0 条状态，不应以红色报错污染日志
- **实际结果**:
  - 文件未创建时 read 直接触发 Mock 404 并 error 输出
- **根因定位**:
  - 读取前未做存在性判断，Mock read 对不存在文件返回 404
- **修复说明**:
  - 在相关 load/index 读取前增加存在性判断，不存在直接返回空结果
- **回归结果**:
  - 用户复测通过：`checkAIData('default')` 无红错，状态返回正常
- **范围边界说明**:
  - QAF-001 在本轮已闭环，后续不纳入快照机制架构改造范围
  - 允许保持“无写操作不创建文件”的懒创建策略（前提是读取无红错、状态返回正确）

---

### QAF-002 AI 记忆面板缺少“手动编辑”能力（规格差异）

- **严重级**: High  
- **状态**: ⏳ 待修复  
- **发现阶段**: UI 端到端测试
- **复现步骤**:
  1. 进入设置页 → AI_MEMORY
  2. 观察 CURRENT_MEMORY 区域仅展示条目列表
  3. 无法逐条新增/修改/删除并保存
- **预期结果**:
  - 用户可手动编辑记忆条目，保存后系统按行重编号
- **实际结果**:
  - 仅可查看/学习/回退，不可直接编辑记忆条目
- **证据**:
  - 规格定义（用户可直接增删改）  
    [AI_SELF_LEARNING_DESIGN_v5.md:L175](file:///d:/Code/VibeCodingWork/pixel_bill/AI_SELF_LEARNING_DESIGN_v5.md#L175)
  - 当前实现为静态列表渲染  
    [SettingsPage.tsx:L1315-L1335](file:///d:/Code/VibeCodingWork/pixel_bill/src/components/mobile/SettingsPage.tsx#L1315-L1335)
- **影响**:
  - 与规格文档不一致，降低“人工纠偏可控性”

---

### QAF-003 自述入口分区不符合文档（应为全局设置区）

- **严重级**: Medium  
- **状态**: ⏳ 待修复  
- **发现阶段**: UI 结构检查 + 用户实测
- **复现步骤**:
  1. 打开设置主面板
  2. 观察 `AI_USER_CONTEXT` 位于 Ledger Settings 分组
- **预期结果**:
  - 自述属于全局共享，应位于全局设置区
- **实际结果**:
  - 自述入口当前放在账本设置区
- **证据**:
  - 文档定义：自述全局、AI记忆账本级  
    [AI_SELF_LEARNING_DESIGN_v5.md:L160-L167](file:///d:/Code/VibeCodingWork/pixel_bill/AI_SELF_LEARNING_DESIGN_v5.md#L160-L167)
  - 当前实现位置  
    [SettingsPage.tsx:L139-L163](file:///d:/Code/VibeCodingWork/pixel_bill/src/components/mobile/SettingsPage.tsx#L139-L163)
- **影响**:
  - 信息架构认知偏差，影响用户对作用域理解

---

### QAF-004 自述 2000 字限制未生效（仅显示计数）

- **严重级**: Medium  
- **状态**: ⏳ 待修复  
- **发现阶段**: UI 输入测试
- **复现步骤**:
  1. 进入 AI_USER_CONTEXT
  2. 输入超过 2000 字并保存
- **预期结果**:
  - 超过 2000 字应被限制或阻止保存并提示
  - 重要，2000字依然太长了，**应限制在500字以内**。
- **实际结果**:
  - 面板显示 `x / 2000` 计数，但仍可超限输入保存
- **证据**:
  - 计数展示存在  
    [SettingsPage.tsx:L997-L999](file:///d:/Code/VibeCodingWork/pixel_bill/src/components/mobile/SettingsPage.tsx#L997-L999)
  - 未见输入上限约束（如 `maxLength`）  
    [SettingsPage.tsx:L985-L995](file:///d:/Code/VibeCodingWork/pixel_bill/src/components/mobile/SettingsPage.tsx#L985-L995)
- **影响**:
  - 规格/交互约束失效，可能影响 Prompt 质量与性能

---

### QAF-007 自述命名未完成迁移（废弃名仍暴露在 UI）

- **严重级**: Medium  
- **状态**: ⏳ 待修复  
- **发现阶段**: UI 术语一致性检查
- **复现步骤**:
  1. 打开设置页菜单与自述编辑页面
  2. 观察标签/标题仍显示 `AI_USER_CONTEXT`
- **预期结果**:
  - 按设计文档完成命名迁移，统一使用 Self-Description（用户自述）语义
  - 废弃命名不应继续在 UI 暴露
- **实际结果**:
  - 设置项标签、视图标题仍使用 `AI_USER_CONTEXT` 旧命名
- **证据**:
  - 设计文档定义：`userContext` 重命名为 Self-Description  
    [AI_SELF_LEARNING_DESIGN_v5.md:L767](file:///d:/Code/VibeCodingWork/pixel_bill/AI_SELF_LEARNING_DESIGN_v5.md#L767)
  - UI 当前标签仍为 `AI_USER_CONTEXT`  
    [SettingsPage.tsx:L160](file:///d:/Code/VibeCodingWork/pixel_bill/src/components/mobile/SettingsPage.tsx#L160)
  - UI 页面标题仍为 `[AI_USER_CONTEXT]`  
    [SettingsPage.tsx:L975](file:///d:/Code/VibeCodingWork/pixel_bill/src/components/mobile/SettingsPage.tsx#L975)
- **影响**:
  - 术语不统一，增加认知成本，削弱文档-产品一致性

---

### QAF-005 快照“当前标记”与落盘时机不一致（状态一致性缺陷）

- **严重级**: High  
- **状态**: ⏳ 待修复  
- **发现阶段**: UI 端到端回退链路测试
- **复现步骤**:
  1. 学习后新增记忆并显示当前快照（如 snap_002）
  2. 回退到 snap_001
  3. 再回退到 snap_002，观察002新增条目和001完全相同，新增条目丢失
- **预期结果**:
  - “当前快照”必须与当前工作区一一对应，任意时刻当前状态都至少有一个可回退快照
  - 初始冷启动（无记忆、无历史快照）也必须满足非悬空约束：系统应自动建立并指向基线快照，禁止出现“当前状态无快照对应”
  - 交互语义应采用“Select 激活快照”而非“Rollback”心智：从历史列表选择一版作为当前工作区基线
  - Select A → Select B → Select A 时，应可恢复到首次 A 状态（往返一致性）
  - 不允许删除当前激活快照；若发生编辑/清空/学习等变更，应先生成新快照并切换当前指向，再允许删除旧快照
- **实际结果**:
  - 现有策略更接近“学习前备份快照”，但 UI 仍标记为“当前”，导致用户误以为当前工作区已被该快照持久化
  - 按“回退”语义操作时，用户期望回到已记录版本，但实际命中的不是用户理解中的当前状态
- **证据**:
  - 学习前创建快照  
    [LearningSession.ts:L167-L172](file:///d:/Code/VibeCodingWork/pixel_bill/src/core/ai_engine/LearningSession.ts#L167-L172)
  - 学习结果返回后设置为当前快照 ID  
    [SettingsPage.tsx:L1135-L1138](file:///d:/Code/VibeCodingWork/pixel_bill/src/components/mobile/SettingsPage.tsx#L1135-L1138)
- **影响**:
  - 非数据破坏型问题，但会破坏“当前指示器=可恢复状态”的心智模型，显著影响回退可预期性与用户信任
  - 在复杂编辑流程中，用户难以判断哪一版真正可恢复，增加误操作风险

---

### QAF-006 快照内容不可见，缺少“查看详情”入口

- **严重级**: High  
- **状态**: ⏳ 待修复  
- **发现阶段**: UI 端到端快照切换测试
- **复现步骤**:
  1. 进入 AI_MEMORY，展开历史快照列表
  2. 观察每个快照仅显示 `id / timestamp / summary`
  3. 无“查看快照内容”按钮或预览区域，无法对比具体条目后再切换
- **预期结果**:
  - 用户在切换快照前应能查看该快照的记忆内容（至少预览，最好可展开详情）
  - 快照切换应基于“可见内容”做决策，而非仅凭标题/时间猜测
- **实际结果**:
  - 当前仅展示摘要字段，缺少内容级可见性与显式查看入口
- **证据**:
  - 历史列表渲染仅含 `snap.summary`，无内容读取与展示  
    [SettingsPage.tsx:L1378-L1380](file:///d:/Code/VibeCodingWork/pixel_bill/src/components/mobile/SettingsPage.tsx#L1378-L1380)
  - 交互按钮仅有 `[ACTIVE]/[ROLLBACK]` 与 `[X]`，无“查看内容”操作  
    [SettingsPage.tsx:L1383-L1402](file:///d:/Code/VibeCodingWork/pixel_bill/src/components/mobile/SettingsPage.tsx#L1383-L1402)
- **影响**:
  - 用户无法判断“切到哪一版”，快照切换决策盲选，显著降低可控性
  - 与快照系统“可追溯/可解释”的产品目标不一致

---

## 4. 下一步 Debug/开发建议（测试视角）

- 关键边界（避免混淆）：
  - QAF-001 已收口（日志噪音问题），与 QAF-005（快照状态一致性）解耦推进
  - QAF-005 需按独立架构主线处理，不以“是否预创建文件”作为验收标准

- 优先级 P0：
  - 修复 QAF-002（AI 记忆手动编辑能力）
  - 修复 QAF-005（保证“当前工作区始终有快照对应”，并将交互语义统一为 Select 激活）
  - 修复 QAF-006（提供快照内容可见性与详情入口）
- 优先级 P1：
  - 修复 QAF-003（自述入口分区调整）
  - 修复 QAF-004（2000 字限制真正生效）
  - 修复 QAF-007（自述命名统一迁移，移除废弃术语）
- 回归测试清单：
  - 首次冷启动 `checkAIData` 无红错
  - 首次冷启动（记忆=0、快照=0）后进入 AI_MEMORY，系统自动形成并显示当前基线快照
  - AI_MEMORY 手动编辑 + 保存 + 重开页面一致性
  - 快照多次 Select/删除后“当前状态”一致
  - 历史列表可查看快照内容后再切换，切换结果与预览一致
  - 自述超限输入阻断与提示
  - 设置页与自述面板命名统一为“用户自述/Self-Description”，不再出现 `AI_USER_CONTEXT`

---

## 5. 状态看板

- ✅ 已修复：QAF-001
- ⏳ 待修复：QAF-002 / QAF-003 / QAF-004 / QAF-005 / QAF-006 / QAF-007
