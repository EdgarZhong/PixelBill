import { DesktopApp } from './views/DesktopApp';
import { MobileApp } from './views/MobileApp';
import { useState, useEffect } from 'react';
import { configManager } from './core/config/ConfigManager';
import { FetchClient } from './core/network/FetchClient';
import { ExampleStore } from './core/services/ExampleStore';
import { MemoryManager } from './core/services/MemoryManager';
import { SnapshotManager } from './core/services/SnapshotManager';
import { SelfDescriptionManager } from './core/services/SelfDescriptionManager';
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
      // @ts-expect-error - Exposing for debug
      window.__DEBUG_TOOLS__ = {
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
          const testId = await window.__DEBUG_TOOLS__.addTestExample(ledgerName);

          // 3. 验证写入
          console.log('\n[Step 3] 验证写入');
          const afterAdd = await ExampleStore.getStats(ledgerName);
          console.log(`  当前实例数: ${afterAdd.count}`);

          // 4. 测试检索
          console.log('\n[Step 4] 测试检索功能');
          const retrieved = await window.__DEBUG_TOOLS__.testRetrieval(ledgerName);

          // 5. 列出所有实例
          console.log('\n[Step 5] 列出所有实例');
          await window.__DEBUG_TOOLS__.listExamples(ledgerName);

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
          const memories3 = await MemoryManager.load(ledgerName);
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
        }
      };
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

