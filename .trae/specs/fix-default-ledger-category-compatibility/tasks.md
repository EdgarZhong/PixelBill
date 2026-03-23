# Tasks

- [x] Task 1: 复现并固化问题证据
  - [x] SubTask 1.1: 记录旧账本 `defined_categories` 为数组的样例与加载路径。
  - [x] SubTask 1.2: 记录标签显示 `0~9` 与“全部未分类”触发条件。
  - [x] SubTask 1.3: 建立最小回归样本用于后续验证。

- [x] Task 2: 实现加载链路结构归一化
  - [x] SubTask 2.1: 在账本读取进入业务态前统一执行数组→映射转换。
  - [x] SubTask 2.2: 确保启动加载与切账本加载共用同一归一化逻辑。
  - [x] SubTask 2.3: 检测旧结构时执行一次性迁移回写。

- [x] Task 3: 修复分类判定与标签生成防线
  - [x] SubTask 3.1: 分类合法性校验基于归一化映射键集合执行。
  - [x] SubTask 3.2: 标签生成对非映射输入做防御处理，禁止数字索引标签进入 UI。
  - [x] SubTask 3.3: 确认不改变现有 UI 按钮触发策略与交互流程。

- [x] Task 4: 回归验证与调试闭环
  - [x] SubTask 4.1: 验证 default 账本加载后分类恢复到语义标签体系。
  - [x] SubTask 4.2: 验证切账本后消费目标切换不受本修复影响。
  - [x] SubTask 4.3: 运行既有调试命令与静态检查，确认无新增回归。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 3
