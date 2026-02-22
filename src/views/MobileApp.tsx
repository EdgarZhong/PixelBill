import { Header } from '../components/mobile/Header';
import { ActivityMatrix } from '../components/mobile/ActivityMatrix';
import { TransactionList } from '../components/TransactionList';
import { DateRangePicker } from '../components/mobile/DateRangePicker';
import { DetailPage } from '../components/mobile/DetailPage';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppLogic } from '../hooks/useAppLogic';
import { useSafeArea, injectSafeAreaCSS } from '../hooks/useSafeArea';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { isSameDay } from 'date-fns';
import { BatchProcessor } from '../core/ai_engine/BatchProcessor';
import { LedgerService } from '../core/services/LedgerService';
import { LedgerManager } from '../core/services/LedgerManager';
import type { Transaction } from '../types';
import type { LedgerMeta } from '../utils/fs-storage';
import { format } from 'date-fns';

export function MobileApp() {
  const {
    transactions,
    filteredTransactions,
    isLoading,
    filter,
    handleTabChange,
    direction,
    dateRange,
    setDateRange,
    fileInputRef,
    handleFileChange,
    handleLoadData,
    handleImportData,
    updateCategory,
    setUserNote,
    setVerification,
    ledgerMemory,
    totalExpense,
    totalIncome,
    TABS
  } = useAppLogic();

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [isDetailAnimating, setIsDetailAnimating] = useState(false);
  const [scaleOrigin, setScaleOrigin] = useState('50% 50%');
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // [CHOOSE_LEDGER]状态
  const [ledgers, setLedgers] = useState<LedgerMeta[]>([]);
  const [activeLedger, setActiveLedger] = useState<string>('default');

  const selectedTransaction = useMemo(() => 
    selectedTxId ? transactions.find(t => t.id === selectedTxId) || null : null
  , [transactions, selectedTxId]);

  const activeTransactionId = selectedTxId || (isDetailAnimating ? lastSelectedId : null);
  
  const safeArea = useSafeArea();

  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'STOPPING' | 'ERROR'>('IDLE');
  const [pulseTrigger, setPulseTrigger] = useState<number>(0);
  const [auraActive, setAuraActive] = useState(false);
  const [delayedTransactions, setDelayedTransactions] = useState<Transaction[]>(filteredTransactions);
  const aiStatusRef = useRef(aiStatus);
  const lastPulseAtRef = useRef(0);
  const prevAiStatusRef = useRef(aiStatus);
  const stopPulseArmedRef = useRef(false);
  const stopPulseConsumedRef = useRef(false);
  const hadAiPatchRef = useRef(false);
  const delayTimeoutRef = useRef<number | null>(null);
  const auraOffTimeoutRef = useRef<number | null>(null);
  // 账本面板打开后的延迟同步定时器，避免首帧卡顿
  const ledgerOpenSyncTimeoutRef = useRef<number | null>(null);

  const triggerPulse = useCallback(() => {
    const now = Date.now();
    lastPulseAtRef.current = now;
    setPulseTrigger(now);
  }, []);
  
  const scheduleAuraOff = useCallback((delayMs: number) => {
    if (auraOffTimeoutRef.current) {
      window.clearTimeout(auraOffTimeoutRef.current);
    }
    auraOffTimeoutRef.current = window.setTimeout(() => {
      setAuraActive(false);
      auraOffTimeoutRef.current = null;
    }, delayMs);
  }, []);

  const applyAiStatus = useCallback((nextStatus: 'IDLE' | 'ANALYZING' | 'STOPPING' | 'ERROR') => {
    const previous = prevAiStatusRef.current;

    if (nextStatus === 'ANALYZING') {
      setAuraActive(true);
      stopPulseArmedRef.current = false;
      stopPulseConsumedRef.current = false;
      hadAiPatchRef.current = false;
    }

    if (nextStatus === 'STOPPING') {
      setAuraActive(true);
      stopPulseArmedRef.current = true;
      stopPulseConsumedRef.current = false;
    }

    if (nextStatus === 'IDLE' && (previous === 'ANALYZING' || previous === 'STOPPING')) {
      scheduleAuraOff(140);
      stopPulseArmedRef.current = false;
      stopPulseConsumedRef.current = true;
      hadAiPatchRef.current = false;
    }

    if (nextStatus === 'ERROR') {
      setAuraActive(false);
      stopPulseArmedRef.current = false;
      stopPulseConsumedRef.current = false;
      hadAiPatchRef.current = false;
    }

    prevAiStatusRef.current = nextStatus;
    aiStatusRef.current = nextStatus;
    setAiStatus(nextStatus);
  }, [scheduleAuraOff]);

  const handleAIAction = useCallback(async () => {
    if (aiStatus === 'IDLE' || aiStatus === 'ERROR') {
      if (transactions.length === 0) {
        handleLoadData();
      } else {
        // Trigger AI Analysis directly if data is present
        try {
          await BatchProcessor.getInstance().run();
        } catch (e) {
          console.error("AI Engine failed to start:", e);
        }
      }
    } else if (aiStatus === 'ANALYZING') {
      BatchProcessor.getInstance().stop();
      applyAiStatus('STOPPING');
    }
  }, [aiStatus, applyAiStatus, handleLoadData, transactions.length]);

  // 账本管理回调函数：支持跳过同步扫描以降低首帧卡顿
  const loadLedgers = useCallback(async (options?: { syncWithFiles?: boolean }) => {
    try {
      const manager = LedgerManager.getInstance();
      // 默认同步索引与文件系统，打开面板时允许跳过同步
      const ledgerList = await manager.listLedgers({
        syncWithFiles: options?.syncWithFiles !== false
      });
      setLedgers(ledgerList);
      const active = manager.getActiveLedgerName();
      setActiveLedger(active);
    } catch (e) {
      console.error('[MobileApp] Failed to load ledgers:', e);
    }
  }, []);

  // 打开账本面板时的加载策略：先快速读索引，再延迟同步扫描
  const handleLedgerPanelOpen = useCallback(() => {
    // 先使用快速读取，避免展开动画被阻塞
    void loadLedgers({ syncWithFiles: false });

    // 清理上一次定时器，防止重复同步
    if (ledgerOpenSyncTimeoutRef.current) {
      window.clearTimeout(ledgerOpenSyncTimeoutRef.current);
    }

    // 延迟执行同步扫描，确保动画完成后再做重操作
    ledgerOpenSyncTimeoutRef.current = window.setTimeout(() => {
      void loadLedgers({ syncWithFiles: true });
      ledgerOpenSyncTimeoutRef.current = null;
    }, 320);
  }, [loadLedgers]);

  const handleSwitchLedger = useCallback(async (name: string) => {
    const manager = LedgerManager.getInstance();
    const success = await manager.switchLedger(name);
    if (success) {
      setActiveLedger(name);
      // 重新加载账本列表以更新 lastOpenedAt
      await loadLedgers();
    }
  }, [loadLedgers]);

  const handleCreateLedger = useCallback(async (name: string) => {
    const manager = LedgerManager.getInstance();
    const success = await manager.createLedger(name);
    if (success) {
      setActiveLedger(name);
      await loadLedgers();
    }
  }, [loadLedgers]);

  const handleDeleteLedger = useCallback(async (name: string) => {
    const manager = LedgerManager.getInstance();
    const success = await manager.deleteLedger(name);
    if (success) {
      setActiveLedger('default');
      await loadLedgers();
    }
  }, [loadLedgers]);

  useEffect(() => {
    return () => {
      // 清理账本面板打开后的延迟同步定时器
      if (ledgerOpenSyncTimeoutRef.current) {
        window.clearTimeout(ledgerOpenSyncTimeoutRef.current);
        ledgerOpenSyncTimeoutRef.current = null;
      }
      if (auraOffTimeoutRef.current) {
        window.clearTimeout(auraOffTimeoutRef.current);
        auraOffTimeoutRef.current = null;
      }
    };
  }, []);

  // 初始化账本管理器
  useEffect(() => {
    // 异步初始化，并在控制台捕获错误（如果有）
    LedgerManager.getInstance().init().catch(err => {
      console.error('[MobileApp] LedgerManager init failed:', err);
    });
  }, []);

  useEffect(() => {
    const processor = BatchProcessor.getInstance();
    const ledgerService = LedgerService.getInstance();
    
    const unsubscribeStatus = processor.on('status', ({ status }) => {
      if (status === 'ANALYZING' && processor.isStopping) {
        applyAiStatus('STOPPING');
      } else {
        applyAiStatus(status);
      }
    });

    const unsubscribeBeforePatch = ledgerService.subscribeBeforePatch(() => {
      hadAiPatchRef.current = true;
      triggerPulse();
      if (aiStatusRef.current === 'STOPPING' && stopPulseArmedRef.current) {
        scheduleAuraOff(140);
        stopPulseArmedRef.current = false;
        stopPulseConsumedRef.current = true;
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeBeforePatch();
    };
  }, [applyAiStatus, scheduleAuraOff, triggerPulse]);

  const handleTransactionSelect = (t: Transaction | null) => {
    if (t) {
      const scrollY = window.scrollY;
      const centerY = scrollY + window.innerHeight / 2;
      setScaleOrigin(`50% ${centerY}px`);
      setLastSelectedId(t.id);
      setSelectedTxId(t.id);
    } else {
      setIsDetailAnimating(true);
      setSelectedTxId(null);
    }
  };
  const tabContainerRef = useRef<HTMLDivElement>(null);
  // 修改 ref 类型以支持 Framer Motion controls
  const animationFrameRef = useRef<number | null>(null);
  
  // 当点击直方图某一天时，过滤该天的交易
  const displayTransactions = selectedDate
    ? filteredTransactions.filter(t => isSameDay(t.originalDate, selectedDate))
    : filteredTransactions;

  useEffect(() => {
    if (delayTimeoutRef.current) {
      window.clearTimeout(delayTimeoutRef.current);
      delayTimeoutRef.current = null;
    }

    const shouldDelay = Date.now() - lastPulseAtRef.current < 1200 && (aiStatus !== 'IDLE' || stopPulseConsumedRef.current);
    const delayMs = shouldDelay ? 760 : 0;
    delayTimeoutRef.current = window.setTimeout(() => {
      setDelayedTransactions(displayTransactions);
      delayTimeoutRef.current = null;
    }, delayMs);
    return () => {
      if (delayTimeoutRef.current) {
        window.clearTimeout(delayTimeoutRef.current);
        delayTimeoutRef.current = null;
      }
    };
  }, [displayTransactions, aiStatus]);

  // 在组件挂载和更新时注入安全区域 CSS 变量
  useEffect(() => {
    injectSafeAreaCSS(safeArea);
  }, [safeArea]);

  // 自定义平滑滚动函数，使用 ease-out-quart 缓动
  const smoothScrollTo = useCallback((element: HTMLElement, target: number, duration: number) => {
    const start = element.scrollLeft;
    const change = target - start;
    const startTime = performance.now();

    // 对数减速曲线 (Ease Out Quart)
    const easeOutQuart = (x: number): number => {
      return 1 - Math.pow(1 - x, 4);
    };

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      
      if (elapsed < duration) {
        const progress = easeOutQuart(elapsed / duration);
        element.scrollLeft = start + change * progress;
        animationFrameRef.current = requestAnimationFrame(animateScroll);
      } else {
        element.scrollLeft = target;
        animationFrameRef.current = null;
      }
    };

    // 取消任何现有的动画
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(animateScroll);
  }, []);

  // 用户交互时停止滚动动画
  const stopScrollAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // 检查标签是否超出容器宽度
  const isOverflowing = TABS.length > 5;
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);

  // 扩展标签列表以实现无限循环效果：[Buffer][Core][Buffer]
  // 仅当内容溢出时使用扩展标签
  const extendedTabs = useMemo(() => {
    if (!isOverflowing) return TABS;
    // 克隆 3 次以确保有足够的缓冲区进行滚动
    return [...TABS, ...TABS, ...TABS];
  }, [TABS, isOverflowing]);

  const derivedActiveTabIndex = useMemo(() => {
    const baseIndex = TABS.indexOf(filter);
    if (baseIndex === -1) return -1;
    return isOverflowing ? baseIndex + TABS.length : baseIndex;
  }, [TABS, filter, isOverflowing]);

  const resolvedActiveTabIndex = useMemo(() => {
    const currentTabAtActiveIndex = extendedTabs[activeTabIndex];
    if (currentTabAtActiveIndex === filter) {
      return activeTabIndex;
    }
    return derivedActiveTabIndex;
  }, [activeTabIndex, derivedActiveTabIndex, extendedTabs, filter]);

  // 使用自定义平滑滚动将选定的标签居中显示在视口中
  const centerTab = useCallback((tabIndex: number) => {
    if (!tabContainerRef.current) return;
    
    const container = tabContainerRef.current;
    
    // 如果没有溢出，只需居中单个实例
    if (!isOverflowing) {
       const tabs = container.children;
       if (tabIndex >= 0 && tabIndex < tabs.length) {
         const tab = tabs[tabIndex] as HTMLElement;
         const containerWidth = container.offsetWidth;
         const tabLeft = tab.offsetLeft;
         const tabWidth = tab.offsetWidth;
         const targetScrollLeft = tabLeft - (containerWidth / 2) + (tabWidth / 2);
         // 验证非无限模式的边界
          const maxScroll = container.scrollWidth - containerWidth;
          const boundedTarget = Math.max(0, Math.min(targetScrollLeft, maxScroll));
          smoothScrollTo(container, boundedTarget, 600);
        }
        return;
     }

     // 对于无限循环（isOverflowing=true），找到最近的目标实例
    const tabs = container.children;
    const N = TABS.length;
    const currentScroll = container.scrollLeft;
    const containerWidth = container.offsetWidth;
    const halfContainer = containerWidth / 2;

    // 候选者：左侧组、中间组、右侧组中的原始索引
    // 左侧组：tabIndex
    // 中间组：tabIndex + N
    // 右侧组：tabIndex + 2N
    const candidates = [tabIndex, tabIndex + N, tabIndex + 2 * N];
    
    let bestTarget = -1;
    let minDiff = Infinity;
    let bestCandidateIndex = -1;

    candidates.forEach(idx => {
      if (idx < 0 || idx >= tabs.length) return;
      
      const tab = tabs[idx] as HTMLElement;
      // 计算此特定实例的目标滚动位置
      // targetScroll = tabCenter - containerCenter
      const tabCenter = tab.offsetLeft + (tab.offsetWidth / 2);
      const targetScroll = tabCenter - halfContainer;
      
      const diff = Math.abs(targetScroll - currentScroll);
      
      if (diff < minDiff) {
        minDiff = diff;
        bestTarget = targetScroll;
        bestCandidateIndex = idx;
      }
    });

    if (bestTarget !== -1) {
      smoothScrollTo(container, bestTarget, 600);
      if (bestCandidateIndex !== -1) {
         setActiveTabIndex(bestCandidateIndex);
      }
    }
  }, [smoothScrollTo, TABS.length, isOverflowing]);

  // 处理滚动以实现无限循环跳转
  const handleScroll = useCallback(() => {
    if (!isOverflowing || !tabContainerRef.current) return;
    
    const container = tabContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    const oneSetWidth = scrollWidth / 3;
    
    // 跳转阈值
    // 如果滚动到左侧缓冲区（第一组），跳转到中间组
    if (scrollLeft < oneSetWidth / 2) {
      container.scrollLeft += oneSetWidth;
      // 同时移动活动标签索引以保持相对位置
      setActiveTabIndex(prev => {
         if (prev === -1) return prev;
         return prev + TABS.length;
      });
    }
    // 如果滚动到右侧缓冲区（第三组），向后跳转到中间组
    else if (scrollLeft > oneSetWidth * 2.5) {
      container.scrollLeft -= oneSetWidth;
      // 同时移动活动标签索引以保持相对位置
      setActiveTabIndex(prev => {
         if (prev === -1) return prev;
         return prev - TABS.length;
      });
    }
  }, [isOverflowing, TABS.length]);

  // 处理带居中效果的标签切换
  const handleTabChangeWithCenter = useCallback((newTab: string, index: number) => {
    // 如果扩展了，我们可能会点击缓冲区的标签。
    // 但是，状态 'filter' 是唯一的。
    // 可视化基于 'filter' 更新。
    // 我们只需要触发滚动到该标签的“中间”表示形式。
    
    const tabIndex = TABS.indexOf(newTab);
    if (tabIndex !== -1) {
      handleTabChange(newTab);
      setActiveTabIndex(index);
      // centerTab 将由 useEffect 在 filter 更改时调用，
      // 但为了点击的即时反馈，我们在这里也设置它
    }
  }, [TABS, handleTabChange]);

  // 初始化标签居中（挂载和更新时）
  useEffect(() => {
    const currentTabIndex = TABS.indexOf(filter);
    if (currentTabIndex !== -1) {
      // 使用小延时让布局在渲染后稳定
      setTimeout(() => centerTab(currentTabIndex), 10);
    }
  }, [TABS, filter, centerTab]);

  const showGhostTabs = isLoading || transactions.length === 0;

  const tabItems = useMemo(() => {
    if (showGhostTabs) {
      return (
        <AnimatePresence mode="popLayout">
          <motion.div 
            key="ghost-container"
            className="flex gap-3"
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div 
                key={`ghost-${i}`}
                className="h-[26px] bg-white/5 rounded-sm animate-pulse-slow flex-shrink-0"
                style={{ width: [60, 80, 60][i] + 'px' }} 
              />
            ))}
          </motion.div>
        </AnimatePresence>
      );
    }

    const centerIndex = Math.floor(extendedTabs.length / 2); 

    return extendedTabs.map((f, index) => {
      const isSelected = filter === f;
      const isActiveInstance = index === resolvedActiveTabIndex;
      const dist = Math.abs(index - centerIndex);
      const delay = Math.min(dist * 0.05, 0.3);
      const layoutId = isActiveInstance ? 'tab-indicator-active' : undefined;

      return (
        <motion.button
          key={`${f}-${index}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ 
            opacity: 1, 
            scale: isSelected ? 1.1 : 1,
            color: isSelected ? '#10B981' : '#9CA3AF'
          }}
          transition={{ 
            opacity: { duration: 0.4, delay: delay, ease: "easeOut" },
            scale: { duration: 0.6, ease: [0.25, 1, 0.5, 1] },
            color: { duration: 0.3 }
          }}
          onClick={() => handleTabChangeWithCenter(f, index)}
          className="pb-2 px-3 text-[10px] relative font-pixel tracking-tight whitespace-nowrap flex-shrink-0"
        >
          {f.toUpperCase()}
          {isSelected && (
            <motion.div 
              layoutId={layoutId}
              transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
              className="absolute bottom-0 left-0 w-full h-[2px] bg-pixel-green shadow-[0_0_8px_rgba(16,185,129,0.6)]" 
            />
          )}
        </motion.button>
      );
    });
  }, [showGhostTabs, extendedTabs, filter, resolvedActiveTabIndex, handleTabChangeWithCenter]);

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 20 : -20,
      opacity: 0,
      filter: 'blur(4px)',
      transition: {
        duration: 0.7,
        ease: [0.25, 1, 0.5, 1] as const
      }
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      filter: 'blur(0px)',
      transition: {
        duration: 0.7,
        ease: [0.25, 1, 0.5, 1] as const,
        filter: { duration: 0.1, ease: "linear" }
      }
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 20 : -20,
      opacity: 0,
      filter: 'blur(4px)',
      transition: {
        duration: 0.7,
        ease: [0.25, 1, 0.5, 1] as const
      }
    })
  };

  return (
    <>
      {/* 固定背景层 */}
      <div className="fixed inset-0 z-[-1] bg-background bg-dot-matrix pointer-events-none" />
      
      {/* 主页面 - 始终渲染 */}
      <motion.div 
        className="min-h-screen"
        style={{
          paddingLeft: `max(0.75rem, ${safeArea.left}px)`,
          paddingRight: `max(0.75rem, ${safeArea.right}px)`,
          transformOrigin: scaleOrigin
        }}
        animate={{
          scale: selectedTransaction ? 0.95 : 1,
          filter: selectedTransaction ? 'blur(4px)' : 'blur(0px)',
          opacity: selectedTransaction ? 0.6 : 1
        }}
        transition={{
          duration: 0.4,
          ease: [0.4, 0.0, 0.2, 1]
        }}
      >
        {/* 隐藏的 CSV 选择输入框 (Mobile: 文件选择器) */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="*/*" 
          multiple
        />

        <Header
          isLoading={isLoading}
          onImportData={handleImportData}
          ledgers={ledgers}
          activeLedger={activeLedger}
          onSwitchLedger={handleSwitchLedger}
          onCreateLedger={handleCreateLedger}
          onDeleteLedger={handleDeleteLedger}
          onLoadLedgers={handleLedgerPanelOpen}
          aiStatus={aiStatus}
          onAIAction={handleAIAction}
        />
        <main className="animate-fade-in">
          {/* 统计栏 - 移动端网格布局 */}
          <div className="grid grid-cols-2 gap-4 mb-3 border-b border-gray-800 pb-3">
            <div className="text-center p-2 bg-card/30 border border-white/5 rounded-sm h-[54px] flex flex-col justify-center">
              <div className="text-dim text-[10px] mb-1">TOTAL_EXPENSE</div>
              <div className="truncate relative h-7 w-full flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                  {transactions.length > 0 ? (
                    <motion.span 
                      key="value"
                      initial={{ opacity: 0, scale: 1.05, filter: 'blur(4px) brightness(2)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px) brightness(1)' }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="text-xl font-bold text-expense-red absolute"
                    >
                      -¥{totalExpense.toFixed(0)}
                    </motion.span>
                  ) : (
                    <motion.span 
                      key="awaiting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
                      className="text-[10px] text-expense-red animate-pulse-slow font-mono block absolute"
                    >
                      [AWAITING_DATA]
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className="text-center p-2 bg-card/30 border border-white/5 rounded-sm h-[54px] flex flex-col justify-center">
              <div className="text-dim text-[10px] mb-1">TOTAL_INCOME</div>
              <div className="truncate relative h-7 w-full flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                  {transactions.length > 0 ? (
                    <motion.span 
                      key="value"
                      initial={{ opacity: 0, scale: 1.05, filter: 'blur(4px) brightness(2)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px) brightness(1)' }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="text-xl font-bold text-income-yellow absolute"
                    >
                      +¥{totalIncome.toFixed(0)}
                    </motion.span>
                  ) : (
                    <motion.span 
                      key="awaiting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
                      className="text-[10px] text-income-yellow animate-pulse-slow font-mono block absolute"
                    >
                      [AWAITING_DATA]
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className="text-center p-2 bg-card/30 border border-white/5 rounded-sm h-[54px] flex flex-col justify-center">
              <div className="text-dim text-[10px] mb-1">TXN_COUNT</div>
              <div className="truncate relative h-7 w-full flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                  {transactions.length > 0 ? (
                    <motion.span 
                      key="value"
                      initial={{ opacity: 0, scale: 1.05, filter: 'blur(4px) brightness(2)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px) brightness(1)' }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="text-xl font-bold text-gray-200 absolute"
                    >
                      {filteredTransactions.length}
                    </motion.span>
                  ) : (
                    <motion.span 
                      key="awaiting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
                      className="text-[10px] text-gray-200 animate-pulse-slow font-mono block absolute"
                    >
                      [AWAITING_DATA]
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className="w-full h-full">
              {transactions.length > 0 ? (
                <DateRangePicker
                  label="DATA_RANGE"
                  minDate={transactions[transactions.length - 1]?.originalDate || new Date()}
                  maxDate={transactions[0]?.originalDate || new Date()}
                  startDate={dateRange.start || transactions[transactions.length - 1]?.originalDate || new Date()}
                  endDate={dateRange.end || transactions[0]?.originalDate || new Date()}
                  onChange={(start, end) => setDateRange({ start, end })}
                />
              ) : (
                <div className="flex flex-col items-center justify-start w-full h-full bg-card/30 border border-white/5 rounded-sm p-2">
                  <div className="text-dim text-[10px] mb-1 font-mono tracking-wider">DATA_RANGE</div>
                  <div className="relative flex items-center justify-center font-mono text-sm gap-1.5 h-6">
                     <span className="text-[10px] opacity-50 animate-pulse-slow font-mono">[AWAITING_DATA]</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 活动矩阵 - 移动版 */}
          <ActivityMatrix 
            transactions={filteredTransactions}
            onDateClick={(date) => setSelectedDate(date)}
            dateRange={dateRange}
            selectedDate={selectedDate}
          />

          {/* 显示选定日期指示器和清除按钮 */}
          <AnimatePresence>
            {selectedDate && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
                className="overflow-hidden"
              >
                <div className="bg-card/50 border border-pixel-green/50 rounded-sm">
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-xs font-mono text-pixel-green">
                      FILTERED: {format(selectedDate, 'yyyy-MM-dd')}
                    </span>
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="text-xs px-2 py-1 bg-pixel-green/20 hover:bg-pixel-green/40 text-pixel-green rounded transition-colors"
                    >
                      CLEAR
                    </button>
                  </div>
                </div>
                {/* 垫片替代 marginBottom，确保动画平滑无跳动 */}
                <div className="h-6" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* 过滤标签 - 轮播样式 */}
          <div className="mb-2 relative overflow-hidden">
            <div className="border-b border-gray-800 relative">
              <div 
                ref={tabContainerRef}
                className={`flex gap-3 pb-2 relative overflow-x-auto whitespace-nowrap scrollbar-hide ${
                  isOverflowing ? 'justify-start' : 'justify-center'
                }`}
                style={{
                  WebkitOverflowScrolling: 'touch',
                }}
                onTouchStart={stopScrollAnimation}
                onScroll={isOverflowing ? handleScroll : undefined}
              >
                {tabItems}
              </div>
              
              {/* 渐变边缘 - 仅当溢出时显示 */}
              {isOverflowing && (
                <>
                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none" />
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
                </>
              )}</div>
            </div>


          {/* 交易列表 */}
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            <motion.div
              key={filter}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <TransactionList 
                transactions={delayedTransactions}
                onTransactionClick={handleTransactionSelect}
                isMobile={true}
                activeTransactionId={activeTransactionId}
                currentFilter={filter}
                enableAura={auraActive}
                pulseTrigger={pulseTrigger}
              />
            </motion.div>
          </AnimatePresence>

          <footer className="mt-16 mb-8 text-center text-dim text-[10px] font-mono opacity-40">
            <p>DESIGNED & ENGINEERED BY <span className="font-bold text-gray-400">CYBERZEN STUDIO</span></p>
          </footer>
        </main>
      </motion.div>

      {/* 详情页覆盖层 */}
      <AnimatePresence onExitComplete={() => setIsDetailAnimating(false)}>
        {selectedTransaction && (
          <DetailPage
            transaction={selectedTransaction}
            categories={ledgerMemory?.defined_categories || []}
            onClose={() => handleTransactionSelect(null)}
            onUpdate={(updatedTransaction) => {
              if (updatedTransaction.id) {
                const categoryChanged = updatedTransaction.category !== selectedTransaction?.category;
                const noteChanged = updatedTransaction.user_note !== selectedTransaction?.user_note;

                // 1. Handle Category changes
                if (categoryChanged) {
                  // 用户明确修改分类时，写入 user_category 与 user_note
                  updateCategory(
                    updatedTransaction.id,
                    updatedTransaction.category,
                    updatedTransaction.user_note
                  );
                  // Return early to prevent auto-verification side effects
                  return;
                }

                // 2. Handle Note changes (do not touch user_category)
                if (noteChanged) {
                  // 仅修改备注时，不写入 user_category，避免误将当前展示分类固化为用户分类
                  setUserNote(
                    updatedTransaction.id,
                    updatedTransaction.user_note || ''
                  );
                  return;
                }

                // 3. Handle Verification changes
                if (updatedTransaction.is_verified !== selectedTransaction?.is_verified) {
                  setVerification(
                    updatedTransaction.id,
                    updatedTransaction.is_verified || false
                  );
                }
              }
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
