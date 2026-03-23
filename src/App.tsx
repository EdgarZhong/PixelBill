import { DesktopApp } from './views/DesktopApp';
import { MobileApp } from './views/MobileApp';
import { useState, useEffect } from 'react';
import { configManager } from './core/config/ConfigManager';
import { FetchClient } from './core/network/FetchClient';
import { ExampleStore } from './core/services/ExampleStore';
import { MemoryManager } from './core/services/MemoryManager';
import { SnapshotManager } from './core/services/SnapshotManager';
import { SelfDescriptionManager } from './core/services/SelfDescriptionManager';
import { LedgerService } from './core/services/LedgerService';
import { AnimatePresence } from 'framer-motion';
import { SplashScreen } from './components/SplashScreen';
import { SettingsProvider } from './contexts/SettingsContext';
// import { generateSystemPrompt } from './core/llm_service/prompt/SystemPrompt';

function App() {
  const [isMobile, setIsMobile] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  // Monitor window resize and determine layout based on viewport width
  useEffect(() => {
    const checkIsMobile = () => {
      // Mobile breakpoint: less than 768px (typical tablet/mobile threshold)
      const isMobileView = window.innerWidth < 768;
      setIsMobile(isMobileView);
    };

    // Check on mount
    checkIsMobile();

    // Listen to resize events
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Handle Splash Screen Logic
  useEffect(() => {
    // Force splash screen to stay for at least 1.5s to ensure "No Flash" and "Data Warming"
    // This replaces the manual delay we added in useLedger.ts
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // --- Debug / Console Testing Exposure ---
  useEffect(() => {
    // Expose internal tools to window for console testing
    if (import.meta.env.DEV) {
      const debugTools = {
        configManager,
        FetchClient,
        ExampleStore,
        /**
         * 检查当前 AI 配置状态
         * 在控制台运行: window.__DEBUG_TOOLS__.checkAIConfig()
         */
        checkAIConfig: async () => {
          const cfg = await configManager.getConfig();
          const activeModel = await configManager.getActiveModelConfig();
          console.log('[Debug] Full Config:', cfg);
          console.log('[Debug] Active Model Config:', activeModel);
          console.log('[Debug] API Key configured:', activeModel.apiKey ? 'Yes (length: ' + activeModel.apiKey.length + ')' : 'No');
          return { fullConfig: cfg, activeModel };
        },

        // ============================================
        // P0: 实例库测试工具
        // ============================================

        /**
         * 查看当前账本的实例库内容
         * 用法: await window.__DEBUG_TOOLS__.listExamples()
         */
        listExamples: async (ledgerName = 'default') => {
          const examples = await ExampleStore.load(ledgerName);
          console.log(`[ExampleStore] 账本 "${ledgerName}" 的实例库 (${examples.length} 条):`);
          console.table(examples.map(ex => ({
            tx_id: ex.tx_id,
            counterparty: ex.counterparty,
            amount: ex.amount,
            category: ex.category,
            ai_reason: ex.ai_reason?.substring(0, 30) || '-',
            user_reason: ex.user_reason?.substring(0, 30) || '-'
          })));
          return examples;
        },

        /**
         * 手动添加测试数据到实例库
         * 用法: await window.__DEBUG_TOOLS__.addTestExample()
         */
        addTestExample: async (ledgerName = 'default') => {
          const testRecord = {
            id: 'test_' + Date.now(),
            time: '2026-03-16 18:30:00',
            sourceType: 'wechat' as const,
            category: 'meal',
            rawClass: '餐饮',
            counterparty: '测试商户',
            product: '测试商品',
            amount: 45.50,
            direction: 'out' as const,
            paymentMethod: '微信支付',
            transactionStatus: 'SUCCESS' as const,
            remark: '测试备注',
            // meta fields
            ai_category: 'meal',
            ai_reasoning: 'AI 认为这是一顿正餐',
            user_category: '',
            user_note: '',
            is_verified: false,
            updated_at: new Date().toISOString()
          };
          await ExampleStore.addOrUpdate(ledgerName, testRecord, false);
          console.log('[Test] 已添加测试实例:', testRecord.id);
          return testRecord.id;
        },

        /**
         * 测试检索功能
         * 用法: await window.__DEBUG_TOOLS__.testRetrieval()
         */
        testRetrieval: async (ledgerName = 'default') => {
          const testTxs = [
            { id: 'tx1', counterparty: '测试商户', description: '正餐', amount: 45, time: '18:30' },
            { id: 'tx2', counterparty: '肯德基', description: '快餐', amount: 35, time: '12:00' }
          ];
          const results = await ExampleStore.retrieveRelevant(ledgerName, testTxs);
          console.log(`[Test] 检索结果 (${results.length} 条):`);
          console.table(results);
          return results;
        },

        /**
         * 清空实例库（谨慎使用）
         * 用法: await window.__DEBUG_TOOLS__.clearExamples()
         */
        clearExamples: async (ledgerName = 'default') => {
          if (confirm(`确定要清空账本 "${ledgerName}" 的实例库吗？`)) {
            await ExampleStore.clear(ledgerName);
            console.log(`[ExampleStore] 已清空账本 "${ledgerName}" 的实例库`);
          }
        },

        /**
         * 运行完整的 P0 测试流程
         * 用法: await window.__DEBUG_TOOLS__.runP0Test()
         */
        runP0Test: async () => {
          console.log('%c🧪 开始 P0 实例库测试...', 'color: #00ff00; font-size: 14px; font-weight: bold');

          const ledgerName = 'default';

          // 1. 初始状态
          console.log('\n[Step 1] 检查初始状态');
          const initialStats = await ExampleStore.getStats(ledgerName);
          console.log(`  当前实例数: ${initialStats.count}`);

          // 2. 添加测试数据
          console.log('\n[Step 2] 添加测试实例');
          const testId = await debugTools.addTestExample(ledgerName);

          // 3. 验证写入
          console.log('\n[Step 3] 验证写入');
          const afterAdd = await ExampleStore.getStats(ledgerName);
          console.log(`  当前实例数: ${afterAdd.count}`);

          // 4. 测试检索
          console.log('\n[Step 4] 测试检索功能');
          const retrieved = await debugTools.testRetrieval(ledgerName);

          // 5. 列出所有实例
          console.log('\n[Step 5] 列出所有实例');
          await debugTools.listExamples(ledgerName);

          // 6. 清理
          console.log('\n[Step 6] 清理测试数据');
          await ExampleStore.deleteByTxId(ledgerName, testId);
          const finalStats = await ExampleStore.getStats(ledgerName);
          console.log(`  当前实例数: ${finalStats.count}`);

          console.log('%c✅ P0 测试完成!', 'color: #00ff00; font-weight: bold');
          return {
            initialCount: initialStats.count,
            finalCount: finalStats.count,
            retrievedCount: retrieved.length
          };
        },

        // ============================================
        // P1: 记忆文件 + 学习会话 测试工具
        // ============================================

        /**
         * 查看当前记忆文件内容
         * 用法: await window.__DEBUG_TOOLS__.loadMemories()
         */
        loadMemories: async (ledgerName = 'default') => {
          const memories = await MemoryManager.load(ledgerName);
          console.log(`[MemoryManager] 账本 "${ledgerName}" 的记忆文件 (${memories.length} 条):`);
          memories.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
          return memories;
        },

        /**
         * 保存记忆文件（覆盖）
         * 用法: await window.__DEBUG_TOOLS__.saveMemories(['记忆1', '记忆2'])
         */
        saveMemories: async (memories: string[], ledgerName = 'default') => {
          await MemoryManager.save(ledgerName, memories);
          console.log(`[MemoryManager] 已保存 ${memories.length} 条记忆到 "${ledgerName}"`);
          return memories;
        },

        /**
         * 添加单条记忆
         * 用法: await window.__DEBUG_TOOLS__.addMemory('新记忆内容')
         */
        addMemory: async (content: string, ledgerName = 'default') => {
          await MemoryManager.add(ledgerName, content);
          console.log(`[MemoryManager] 已添加记忆: ${content}`);
          return await MemoryManager.load(ledgerName);
        },

        /**
         * 修改单条记忆
         * 用法: await window.__DEBUG_TOOLS__.modifyMemory(1, '修改后的内容')
         */
        modifyMemory: async (index: number, content: string, ledgerName = 'default') => {
          await MemoryManager.modify(ledgerName, index, content);
          console.log(`[MemoryManager] 已修改第 ${index} 条记忆: ${content}`);
          return await MemoryManager.load(ledgerName);
        },

        /**
         * 删除单条记忆
         * 用法: await window.__DEBUG_TOOLS__.deleteMemory(1)
         */
        deleteMemory: async (index: number, ledgerName = 'default') => {
          await MemoryManager.delete(ledgerName, index);
          console.log(`[MemoryManager] 已删除第 ${index} 条记忆`);
          return await MemoryManager.load(ledgerName);
        },

        /**
         * 查看快照列表
         * 用法: await window.__DEBUG_TOOLS__.listSnapshots()
         */
        listSnapshots: async (ledgerName = 'default') => {
          const snapshots = await SnapshotManager.list(ledgerName);
          console.log(`[SnapshotManager] 账本 "${ledgerName}" 的快照 (${snapshots.length} 个):`);
          console.table(snapshots.map(s => ({
            id: s.id,
            trigger: s.trigger,
            summary: s.summary.substring(0, 30) + (s.summary.length > 30 ? '...' : ''),
            timestamp: new Date(s.timestamp).toLocaleString()
          })));
          return snapshots;
        },

        /**
         * 创建手动快照
         * 用法: await window.__DEBUG_TOOLS__.createSnapshot('测试快照')
         */
        createSnapshot: async (summary = '手动测试快照', ledgerName = 'default') => {
          const id = await SnapshotManager.create(ledgerName, 'manual', summary);
          console.log(`[SnapshotManager] 已创建快照: ${id}`);
          return id;
        },

        /**
         * 读取快照内容
         * 用法: await window.__DEBUG_TOOLS__.readSnapshot('snap_001')
         */
        readSnapshot: async (snapshotId: string, ledgerName = 'default') => {
          const content = await SnapshotManager.read(ledgerName, snapshotId);
          console.log(`[SnapshotManager] 快照 "${snapshotId}" 内容:`);
          if (content) {
            content.content.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
          }
          return content;
        },

        /**
         * 回退到指定快照
         * 用法: await window.__DEBUG_TOOLS__.rollbackSnapshot('snap_001')
         */
        rollbackSnapshot: async (snapshotId: string, ledgerName = 'default') => {
          const success = await SnapshotManager.rollback(ledgerName, snapshotId);
          if (success) {
            console.log(`[SnapshotManager] 已成功回退到 ${snapshotId}`);
          } else {
            console.error(`[SnapshotManager] 回退失败`);
          }
          return success;
        },

        /**
         * 删除指定快照
         * 用法: await window.__DEBUG_TOOLS__.deleteSnapshot('snap_001')
         */
        deleteSnapshot: async (snapshotId: string, ledgerName = 'default') => {
          const success = await SnapshotManager.delete(ledgerName, snapshotId);
          if (success) {
            console.log(`[SnapshotManager] 已删除快照 ${snapshotId}`);
          } else {
            console.error(`[SnapshotManager] 删除失败`);
          }
          return success;
        },

        /**
         * 查找当前记忆匹配的快照
         * 用法: await window.__DEBUG_TOOLS__.findCurrentSnapshot()
         */
        findCurrentSnapshot: async (ledgerName = 'default') => {
          const snapId = await SnapshotManager.findMatchingSnapshot(ledgerName);
          if (snapId) {
            console.log(`[SnapshotManager] 当前记忆匹配的快照: ${snapId}`);
          } else {
            console.log('[SnapshotManager] 当前记忆与任何快照都不匹配（可能是编辑后的状态）');
          }
          return snapId;
        },

        /**
         * 查看自述文件内容
         * 用法: await window.__DEBUG_TOOLS__.loadSelfDesc()
         */
        loadSelfDesc: async () => {
          const desc = await SelfDescriptionManager.load();
          console.log('[SelfDescriptionManager] 自述文件内容:');
          console.log(desc || '(空)');
          return desc;
        },

        /**
         * 保存自述文件
         * 用法: await window.__DEBUG_TOOLS__.saveSelfDesc('我是西工大学生...')
         */
        saveSelfDesc: async (content: string) => {
          await SelfDescriptionManager.save(content);
          console.log('[SelfDescriptionManager] 已保存自述文件');
          return content;
        },

        /**
         * 通过 ConfigManager 读取用户上下文（兼容旧配置）
         * 用法: await window.__DEBUG_TOOLS__.getUserContext()
         */
        getUserContext: async () => {
          const ctx = await configManager.getUserContext();
          console.log('[ConfigManager] 用户上下文:', ctx || '(空)');
          return ctx;
        },

        /**
         * 运行完整的 P1 测试流程
         * 用法: await window.__DEBUG_TOOLS__.runP1Test()
         */
        runP1Test: async () => {
          console.log('%c🧪 开始 P1 记忆文件测试...', 'color: #00ff00; font-size: 14px; font-weight: bold');

          const ledgerName = 'default';

          // Step 1: 测试记忆文件读写
          console.log('\n[Step 1] 测试记忆文件读写');
          await MemoryManager.save(ledgerName, [
            '我是西工大学生，meal只统计双人用餐',
            '单笔餐饮 > 70元视为大餐，归others',
            '便利店消费 > 20元 + 晚间无正餐 → meal'
          ]);
          const memories1 = await MemoryManager.load(ledgerName);
          console.log(`  ✓ 写入 ${memories1.length} 条记忆`);

          // Step 2: 测试增量更新
          console.log('\n[Step 2] 测试增量更新');
          await MemoryManager.add(ledgerName, '益禾堂：奶茶饮品，归others');
          const memories2 = await MemoryManager.load(ledgerName);
          console.log(`  ✓ ADD 操作成功，现在有 ${memories2.length} 条记忆`);

          await MemoryManager.modify(ledgerName, 2, '单笔餐饮 > 80元视为大餐（已调整）');
          await MemoryManager.load(ledgerName);
          console.log(`  ✓ MODIFY 操作成功，第2条已更新`);

          await MemoryManager.delete(ledgerName, 3);
          const memories4 = await MemoryManager.load(ledgerName);
          console.log(`  ✓ DELETE 操作成功，现在有 ${memories4.length} 条记忆`);

          // Step 3: 测试快照功能
          console.log('\n[Step 3] 测试快照功能');
          const snapId = await SnapshotManager.create(ledgerName, 'manual', 'P1 测试快照');
          console.log(`  ✓ 创建快照成功: ${snapId}`);

          const snapshots = await SnapshotManager.list(ledgerName);
          console.log(`  ✓ 读取快照成功，共 ${snapshots.length} 个快照`);

          // Step 4: 测试自述文件
          console.log('\n[Step 4] 测试自述文件');
          await SelfDescriptionManager.save('我是西工大学生，和女朋友一起生活，meal只统计双人用餐');
          const selfDesc = await SelfDescriptionManager.load();
          console.log(`  ✓ 保存自述成功`);
          console.log(`  ✓ 读取自述成功: ${selfDesc?.substring(0, 30)}...`);

          // Step 5: 测试 ConfigManager 兼容接口
          console.log('\n[Step 5] 测试 ConfigManager 兼容接口');
          const ctx = await configManager.getUserContext();
          console.log(`  ✓ getUserContext 成功: ${ctx ? ctx.substring(0, 30) + '...' : '(空)'}`);

          console.log('\n%c✅ P1 测试完成!', 'color: #00ff00; font-weight: bold');
          return {
            memoryCount: memories4.length,
            snapshotCount: snapshots.length,
            hasSelfDesc: !!selfDesc,
            hasUserContext: !!ctx
          };
        },

        /**
         * 清理 P1 测试数据（谨慎使用）
         * 用法: await window.__DEBUG_TOOLS__.clearP1Data()
         */
        clearP1Data: async (ledgerName = 'default') => {
          if (confirm(`确定要清理账本 "${ledgerName}" 的所有 P1 数据吗？（记忆文件、快照、自述）`)) {
            await MemoryManager.clear(ledgerName);
            await SnapshotManager.clearAll(ledgerName);
            await SelfDescriptionManager.save('');
            console.log('[P1 Cleanup] 已清理所有 P1 测试数据');
          }
        },

        /**
         * 清除当前账本的 AI 记忆和快照（保留实例库）
         * 用法: await window.__DEBUG_TOOLS__.clearCurrentLedgerAI('default')
         */
        clearCurrentLedgerAI: async (ledgerName = 'default') => {
          if (confirm(`确定要清除账本 "${ledgerName}" 的 AI 记忆和快照吗？\n\n这将删除：\n- 记忆文件 (${ledgerName}.md)\n- 所有历史快照\n\n实例库（修正记录）将保留。`)) {
            try {
              // 1. 清除记忆文件
              await MemoryManager.clear(ledgerName);
              console.log(`[Clear AI Memory] 已清除记忆文件: classify_memory/${ledgerName}.md`);

              // 2. 清除所有快照
              await SnapshotManager.clearAll(ledgerName);
              console.log(`[Clear AI Memory] 已清除所有快照: memory_snapshots/${ledgerName}/`);

              console.log('%c✅ AI 记忆和快照已清除', 'color: #10b981; font-weight: bold');
              console.log('提示：实例库（用户修正记录）已保留，可重新触发学习会话');
            } catch (e) {
              console.error('[Clear AI Memory] 清除失败:', e);
            }
          }
        },

        /**
         * 查看当前账本的 AI 数据状态
         * 用法: await window.__DEBUG_TOOLS__.checkAIData('default')
         */
        checkAIData: async (ledgerName = 'default') => {
          console.log(`%c📊 账本 "${ledgerName}" AI 数据状态`, 'color: #10b981; font-size: 14px; font-weight: bold');

          // 1. 检查记忆文件
          const memories = await MemoryManager.load(ledgerName);
          console.log(`\n[记忆文件] ${memories.length} 条`);
          if (memories.length > 0) {
            memories.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
          }

          // 2. 检查快照
          const snapshots = await SnapshotManager.list(ledgerName);
          console.log(`\n[历史快照] ${snapshots.length} 个`);
          if (snapshots.length > 0) {
            snapshots.slice(0, 5).forEach(s => {
              console.log(`  - ${s.id}: ${s.trigger} (${s.summary})`);
            });
            if (snapshots.length > 5) {
              console.log(`  ... 还有 ${snapshots.length - 5} 个`);
            }
          }

          // 3. 检查实例库
          const examples = await ExampleStore.load(ledgerName);
          console.log(`\n[实例库] ${examples.length} 条修正记录`);

          // 4. 检查自述文件
          const selfDesc = await SelfDescriptionManager.load();
          console.log(`\n[自述文件] ${selfDesc ? '已配置 (' + selfDesc.substring(0, 30) + '...)' : '未配置'}`);

          return {
            ledgerName,
            memoryCount: memories.length,
            snapshotCount: snapshots.length,
            exampleCount: examples.length,
            hasSelfDesc: !!selfDesc
          };
        },

        // ============================================
        // P2: 分类任务队列 测试工具
        // ============================================

        /**
         * 查看分类任务队列
         * 用法: await window.__DEBUG_TOOLS__.viewQueue()
         */
        viewQueue: async (ledger?: string) => {
          const { classifyQueue } = await import('./core/ai_engine/ClassifyQueue');
          const { LedgerManager } = await import('./core/services/LedgerManager');
          const activeLedger = LedgerManager.getInstance().getActiveLedgerName();
          const targetLedger = ledger === '*' ? undefined : (ledger || activeLedger);
          const tasks = await classifyQueue.getPending(targetLedger);
          console.log(`[ClassifyQueue] 队列视图(${targetLedger || 'ALL'})，共 ${tasks.length} 个任务:`);
          console.table(tasks.map(t => ({
            ledger: t.ledger,
            date: t.date,
            type: t.type,
            tag: t.tag || '-',
            enqueuedAt: new Date(t.enqueuedAt).toLocaleTimeString()
          })));
          return tasks;
        },

        /**
         * 添加测试任务到队列
         * 用法: await window.__DEBUG_TOOLS__.addTestTask()
         */
        addTestTask: async (ledger = 'default', date = '2026-03-18', type = 'normal') => {
          const { classifyQueue } = await import('./core/ai_engine/ClassifyQueue');
          const success = await classifyQueue.enqueue({
            ledger,
            date,
            type: type as 'normal' | 'reclassify_full' | 'reclassify_affected' | 'reclassify_scoped'
          });
          if (success) {
            console.log(`[ClassifyQueue] 已添加任务: ${type} for ${ledger}/${date}`);
          } else {
            console.log('[ClassifyQueue] 任务未添加（可能已存在同优先级或更高优先级任务）');
          }
          return success;
        },

        /**
         * 清空任务队列
         * 用法: await window.__DEBUG_TOOLS__.clearQueue()
         */
        clearQueue: async () => {
          const { classifyQueue } = await import('./core/ai_engine/ClassifyQueue');
          if (confirm('确定要清空分类任务队列吗？')) {
            await classifyQueue.clear();
            console.log('[ClassifyQueue] 队列已清空');
          }
        },

        /**
         * 测试队列优先级升级
         * 用法: await window.__DEBUG_TOOLS__.testQueuePriority()
         */
        testQueuePriority: async () => {
          const { classifyQueue } = await import('./core/ai_engine/ClassifyQueue');
          console.log('%c🧪 测试队列优先级升级...', 'color: #00ff00; font-size: 14px; font-weight: bold');

          // 1. 添加 normal 任务
          console.log('\n[Step 1] 添加 normal 任务');
          await classifyQueue.enqueue({ ledger: 'test', date: '2026-03-18', type: 'normal' });
          await debugTools.viewQueue('test');

          // 2. 尝试添加相同 normal 任务（应被忽略）
          console.log('\n[Step 2] 再次添加 normal 任务（应被忽略）');
          const ignored = await classifyQueue.enqueue({ ledger: 'test', date: '2026-03-18', type: 'normal' });
          console.log(`  结果: ${ignored ? '已添加' : '已忽略'}`);

          // 3. 升级为 reclassify_full（应成功）
          console.log('\n[Step 3] 升级为 reclassify_full（应成功）');
          const upgraded = await classifyQueue.enqueue({ ledger: 'test', date: '2026-03-18', type: 'reclassify_full' });
          console.log(`  结果: ${upgraded ? '已升级' : '未升级'}`);
          await debugTools.viewQueue('test');

          // 4. 清理
          console.log('\n[Step 4] 清理测试数据');
          await classifyQueue.remove('test', '2026-03-18');

          console.log('%c✅ 优先级测试完成', 'color: #00ff00; font-weight: bold');
        },

        queueSnapshot: async (ledger: string = '*') => {
          const tasks = await debugTools.viewQueue(ledger);
          const byLedger: Record<string, number> = {};
          const byType: Record<string, number> = {};
          for (const task of tasks) {
            byLedger[task.ledger] = (byLedger[task.ledger] || 0) + 1;
            byType[task.type] = (byType[task.type] || 0) + 1;
          }
          const ledgerStats = Object.entries(byLedger).map(([ledgerName, count]) => ({ ledger: ledgerName, count }));
          const typeStats = Object.entries(byType).map(([type, count]) => ({ type, count }));
          console.log('[ClassifyQueue] 快照统计');
          console.table(ledgerStats);
          console.table(typeStats);
          return { total: tasks.length, byLedger, byType };
        },

        addTestTasksBatch: async (
          tasks: Array<{
            ledger: string;
            date: string;
            type: 'normal' | 'reclassify_full' | 'reclassify_affected' | 'reclassify_scoped';
            tag?: string;
          }>
        ) => {
          const { classifyQueue } = await import('./core/ai_engine/ClassifyQueue');
          const results: Array<{ ledger: string; date: string; type: string; added: boolean }> = [];
          for (const task of tasks) {
            const added = await classifyQueue.enqueue(task);
            results.push({ ledger: task.ledger, date: task.date, type: task.type, added });
          }
          console.table(results);
          return results;
        },

        peekTask: async (ledger?: string) => {
          const { classifyQueue } = await import('./core/ai_engine/ClassifyQueue');
          const { LedgerManager } = await import('./core/services/LedgerManager');
          const targetLedger = ledger || LedgerManager.getInstance().getActiveLedgerName();
          const task = await classifyQueue.peek(targetLedger);
          console.log(`[ClassifyQueue] peek(${targetLedger}):`, task);
          return task;
        },

        dequeueTask: async (ledger?: string) => {
          const { classifyQueue } = await import('./core/ai_engine/ClassifyQueue');
          const { LedgerManager } = await import('./core/services/LedgerManager');
          const targetLedger = ledger || LedgerManager.getInstance().getActiveLedgerName();
          const task = await classifyQueue.dequeue(targetLedger);
          console.log(`[ClassifyQueue] dequeue(${targetLedger}):`, task);
          return task;
        },

        removeTask: async (ledger: string, date: string) => {
          const { classifyQueue } = await import('./core/ai_engine/ClassifyQueue');
          const removed = await classifyQueue.remove(ledger, date);
          console.log(`[ClassifyQueue] remove(${ledger}, ${date}): ${removed}`);
          return removed;
        },

        runP2Test: async (options?: {
          ledgerA?: string;
          ledgerB?: string;
          dateA?: string;
          dateB?: string;
        }) => {
          const ledgerA = options?.ledgerA || `p2_a_${Date.now()}`;
          const ledgerB = options?.ledgerB || `p2_b_${Date.now()}`;
          const dateA = options?.dateA || '2026-03-18';
          const dateB = options?.dateB || '2026-03-19';
          console.log('%c🧪 开始 P2 回归测试...', 'color: #00ff00; font-size: 14px; font-weight: bold');
          await debugTools.clearQueue();
          await debugTools.addTestTask(ledgerA, dateA, 'normal');
          await debugTools.addTestTask(ledgerA, dateA, 'reclassify_full');
          await debugTools.addTestTask(ledgerB, dateB, 'normal');
          const queueA = await debugTools.viewQueue(ledgerA);
          const queueB = await debugTools.viewQueue(ledgerB);
          const all = await debugTools.viewQueue('*');
          const snap = await debugTools.queueSnapshot('*');
          const peekA = await debugTools.peekTask(ledgerA);
          await debugTools.removeTask(ledgerA, dateA);
          await debugTools.removeTask(ledgerB, dateB);
          console.log('%c✅ P2 回归测试完成', 'color: #00ff00; font-weight: bold');
          return {
            ledgerA,
            ledgerB,
            dateA,
            dateB,
            queueA: queueA.length,
            queueB: queueB.length,
            total: all.length,
            peekA,
            snapshot: snap
          };
        },

        testLedgerLifecycleQueue: async () => {
          const { classifyQueue } = await import('./core/ai_engine/ClassifyQueue');
          const { LedgerManager } = await import('./core/services/LedgerManager');
          const manager = LedgerManager.getInstance();
          await manager.init();
          const original = manager.getActiveLedgerName();
          const seed = Date.now();
          const oldName = `p2_lifecycle_${seed}`;
          const newName = `p2_lifecycle_renamed_${seed}`;
          const date = '2026-03-20';
          const created = await manager.createLedger(oldName);
          await classifyQueue.enqueue({ ledger: oldName, date, type: 'normal' });
          const beforeRename = await classifyQueue.getPending(oldName);
          const renamed = created ? await manager.renameLedger(oldName, newName) : false;
          const afterRenameOld = await classifyQueue.getPending(oldName);
          const afterRenameNew = await classifyQueue.getPending(newName);
          const deleted = renamed ? await manager.deleteLedger(newName) : false;
          const afterDelete = await classifyQueue.getPending(newName);
          if (manager.getActiveLedgerName() !== original) {
            await manager.switchLedger(original);
          }
          const result = {
            created,
            renamed,
            deleted,
            beforeRename: beforeRename.length,
            afterRenameOld: afterRenameOld.length,
            afterRenameNew: afterRenameNew.length,
            afterDelete: afterDelete.length
          };
          console.table(result);
          return result;
        },

        // ============================================
        // P2: 标签管理 API 测试工具
        // ============================================

        /**
         * 获取当前账本的所有标签
         * 用法: await window.__DEBUG_TOOLS__.listCategories()
         */
        listCategories: () => {
          const service = LedgerService.getInstance();
          const categories = service.getCategories();
          console.log('[LedgerService] 当前标签:');
          Object.entries(categories).forEach(([name, desc]) => {
            console.log(`  ${name}: ${desc}`);
          });
          return categories;
        },

        /**
         * 添加新标签
         * 用法: await window.__DEBUG_TOOLS__.addCategory('coffee', '咖啡饮品支出')
         */
        addCategory: async (name: string, description: string) => {
          const service = LedgerService.getInstance();
          const success = await service.addCategory(name, description);
          if (success) {
            console.log(`[LedgerService] 已添加标签: ${name}`);
          }
          return success;
        },

        /**
         * 删除标签
         * 用法: await window.__DEBUG_TOOLS__.deleteCategory('coffee')
         */
        deleteCategory: async (name: string) => {
          const service = LedgerService.getInstance();
          const result = await service.deleteCategory(name);
          if (result.success) {
            console.log(`[LedgerService] 已删除标签: ${name}, 影响 ${result.affectedTxIds.length} 条交易`);
          }
          return result;
        },

        /**
         * 重命名标签
         * 用法: await window.__DEBUG_TOOLS__.renameCategory('coffee', 'drink')
         */
        renameCategory: async (oldName: string, newName: string) => {
          const service = LedgerService.getInstance();
          const success = await service.renameCategory(oldName, newName);
          if (success) {
            console.log(`[LedgerService] 已重命名标签: ${oldName} -> ${newName}`);
          }
          return success;
        },

        /**
         * 更新标签描述
         * 用法: await window.__DEBUG_TOOLS__.updateCategoryDesc('meal', '日常正餐支出（含午餐和晚餐）')
         */
        updateCategoryDesc: async (name: string, description: string) => {
          const service = LedgerService.getInstance();
          const success = await service.updateCategoryDescription(name, description);
          if (success) {
            console.log(`[LedgerService] 已更新标签描述: ${name}`);
          }
          return success;
        }
      };
      window.__DEBUG_TOOLS__ = debugTools;
    }
  }, []);

  return (
    <SettingsProvider>
      <div className="relative w-full h-full">
        {/* 1. Main App Layer (Base Layer) */}
        {/* It is always rendered in the background to ensure "No Flash" when splash exits */}
        <div className="absolute inset-0 z-0">
          {isMobile ? <MobileApp /> : <DesktopApp />}
        </div>

        {/* 2. Splash Screen Overlay Layer */}
        {/* High z-index ensures it covers everything */}
        <AnimatePresence>
          {showSplash && <SplashScreen key="splash" />}
        </AnimatePresence>
      </div>
    </SettingsProvider>
  );
}

export default App;

