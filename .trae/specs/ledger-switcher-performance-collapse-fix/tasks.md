# Tasks
- [x] Task 1: 优化二级面板展开性能
  - [x] SubTask 1.1: 分析展开时的重排与重绘来源
  - [x] SubTask 1.2: 延迟非关键内容渲染，确保首帧稳定
- [x] Task 2: 修复收起形变为按钮的连续性
  - [x] SubTask 2.1: 保证按钮与面板共享同一 layoutId 且无额外按钮插入
  - [x] SubTask 2.2: 调整 AnimatePresence 策略避免按钮单独跳出
- [x] Task 3: 运行相关校验（按需）
