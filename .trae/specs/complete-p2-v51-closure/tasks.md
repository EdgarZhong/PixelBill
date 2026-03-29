# Tasks

- [x] Task 1: 对齐 v5.1 与现状差距，冻结 P2 实施边界
  - [x] SubTask 1.1: 审核 `AI_SELF_LEARNING_DESIGN_v5.md` 第 5 章与当前代码实现差异
  - [x] SubTask 1.2: 审核 `docs/P0_P1_FIX_RISK_MEMO.md` 与 `docs/P0_P1_QA_MEMO_2026-03-23.md` 的必改项
  - [x] SubTask 1.3: 输出代码现状审计清单（已实现/缺失/风险）并附关键文件定位
  - [x] SubTask 1.4: 输出冲突处理清单并标注“以 v5.1 为准”的落地点

- [x] Task 2: 完成队列持久化与消费端稳定性闭环
  - [x] SubTask 2.1: 校验/补齐 `classify_queue/{ledger}.json` 按账本隔离与按天去重
  - [x] SubTask 2.2: 完成消费端 CAS 出队保护，防止同日重入吞任务
  - [x] SubTask 2.3: 完成失败不出队与重启续跑能力
  - [x] SubTask 2.4: 实现空任务清理与监控计数

- [x] Task 3: 完成触发层生产逻辑与补偿机制闭环
  - [x] SubTask 3.1: 落实“仅 CSV 自动触发，其余用户确认触发”
  - [x] SubTask 3.2: 实现前置改写同步落盘与 dirtyDates 入队成对成立
  - [x] SubTask 3.3: 增加“前置成功+入队失败”补偿日志与重启补齐
  - [x] SubTask 3.4: 统一日期归一化函数，保证筛选/入队/消费一致

- [x] Task 4: 打通写回保护与跨账本消费隔离
  - [x] SubTask 4.1: 固定单次消费会话 ledger 上下文，切账本后再切换消费目标
  - [x] SubTask 4.2: AI 写回前增加 `is_verified` 最新状态二次校验
  - [x] SubTask 4.3: 验证生产→入队→消费→Arbiter 写回→状态反馈全链路

- [x] Task 5: 修复 P0/P1 备忘录三项设置页问题
  - [x] SubTask 5.1: 移除 `AUTO_RULES` 废弃入口及占位逻辑
  - [x] SubTask 5.2: 落地 `MANAGE_CATEGORIES` 可用交互（非占位日志）
  - [x] SubTask 5.3: 统一设置页 placeholder/helper 文案中文化

- [x] Task 6: 补齐调试组件、SOP 与闭环验收证据
  - [x] SubTask 6.1: 增补/整理 P2 控制台调试命令（最小回归集）
  - [x] SubTask 6.2: 更新相关文档（必要时 `CLAUDE.md` 与 docs）
  - [x] SubTask 6.3: 执行自动化测试、调试命令与最小回归并记录结果
  - [x] SubTask 6.4: 产出“第 5 章完成映射表 + 文件清单 + 遗留风险”

- [x] Task 7: 修复本轮 checklist 未通过项并补齐验收证据
  - [x] SubTask 7.1: 落实“前置改写 + dirtyDates 入队”成对落地并接线所有用户确认场景
    - 说明：已补齐标签变更链路（新增/删除/重命名/描述更新）在服务层落盘后即生产 dirtyDates 并入队，消费按钮仅负责启动引擎。
  - [x] SubTask 7.2: 增加全链路可观测回归脚本（生产→入队→消费→Arbiter写回→状态反馈）
    - 说明：已新增一键全链路回归命令并输出关键事件证据，支持重复执行与结果对照。
  - [x] SubTask 7.3: 扩展控制台调试命令覆盖 P2 最小必测集
    - 说明：已补齐“消费中同日重入、失败保留重试、锁定竞态保护、补偿恢复”等边界用例命令。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 2 and Task 3
- Task 5 can run in parallel with Task 2/3/4
- Task 6 depends on Task 2, Task 3, Task 4, and Task 5
- Task 7 depends on Task 2, Task 3, Task 4, and Task 6
