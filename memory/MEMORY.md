# PixelBill 项目状态

**最后更新**: 2026-03-16

---

## 当前阶段

**P0 + P1 已完成并推送** ✅

- P0: 实例库自动采集 + 注入 (commit: 55ce6f7)
- P1: 记忆文件 + 学习会话 (commit: 2029592)

---

## 已实现功能

### P0: 实例库 (ExampleStore)
- 用户修正/锁定时自动采集分类案例
- 批量检索相关案例注入 Prompt
- 浏览器调试: `window.__DEBUG_TOOLS__.runP0Test()`

### P1: 记忆文件系统
- **MemoryManager**: 增量更新 (ADD/MODIFY/DELETE)
- **SnapshotManager**: 版本快照与回退
- **SelfDescriptionManager**: 用户自述独立文件
- **LearningSession**: LLM 学习会话
- **SettingsPage**: AI 记忆面板 (学习按钮/阈值/历史)
- 浏览器调试: `window.__DEBUG_TOOLS__.runP1Test()`

---

## 下一步工作 (P2)

**标签管理升级 + 分类队列**

预估工作量: 3-4 天

主要任务:
1. `defined_categories` 升级为映射 (key → 描述)
2. 标签增删改的连锁处理
3. 分类任务队列 (ClassifyQueue)
4. 触发层逻辑 (ClassifyTrigger)
5. 渐进式重分类交互

---

## 项目文档索引

| 文档 | 说明 |
|------|------|
| `AI_SELF_LEARNING_DESIGN_v4 (1).md` | AI 自学习系统完整设计 (v4.2) |
| `docs/P0_IMPLEMENTATION_SUMMARY.md` | P0 实施总结 |
| `docs/P0_TEST_GUIDE.md` | P0 测试指南 |
| `docs/P1_IMPLEMENTATION_SUMMARY.md` | P1 实施总结 |
| `docs/P1_TEST_GUIDE.md` | P1 测试指南 |
| `CLAUDE.md` | 项目规范与进展 |

---

## 开发环境

```bash
# 启动开发服务器
npm run dev

# 浏览器访问
http://localhost:5174/
```

---

**下次开始**: 可以直接开始 P2 开发，或先回顾 P1 文档。
