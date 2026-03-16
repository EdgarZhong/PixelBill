import { DesktopApp } from './views/DesktopApp';
import { MobileApp } from './views/MobileApp';
import { useState, useEffect } from 'react';
import { configManager } from './core/config/ConfigManager';
import { FetchClient } from './core/network/FetchClient';
import { ExampleStore } from './core/services/ExampleStore';
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

